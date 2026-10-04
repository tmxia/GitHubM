package com.github.manager

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 通知网关 - 唯一通知出口
 *
 * 所有编译完成通知（来自前端轮询或 WorkManager）都必须通过本类发送。
 * 使用 synchronized + SharedPreferences.commit() 保证：
 *   1. 同一 runKey 全局只发一次通知
 *   2. 原子性：写去重标记 -> 发通知，中间不会被打断
 *   3. 跨组件（Activity/Worker/协程）共享同一份去重状态
 */
object NotificationGateway {
    private const val PREFS_NAME = "gm_notif_dedup"
    private const val KEY_PREFIX = "notified_"
    private const val CHANNEL_ID = "compile_done"
    private const val MAX_RECORDS = 500
    private const val CLEANUP_INTERVAL = 100

    private val lock = Any()

    /**
     * 尝试发送编译完成通知（带去重）
     * @return true=实际发送；false=已通知过/失败
     */
    fun tryNotify(
        ctx: Context,
        runKey: String,
        title: String,
        body: String,
        deepLink: String,
    ): Boolean {
        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val key = KEY_PREFIX + runKey

            if (prefs.getBoolean(key, false)) {
                android.util.Log.d("GM_GATEWAY", "skip: already notified $runKey")
                return false
            }

            // 同步写（commit），保证后续并发读能立刻看到
            prefs.edit().putBoolean(key, true).commit()

            // 周期性清理，防止 SharedPreferences 无限膨胀
            cleanupIfNeeded(prefs)

            return sendNotification(ctx, title, body, deepLink)
        }
    }

    /** 检查某 runKey 是否已通知过（供前端查询） */
    fun isNotified(ctx: Context, runKey: String): Boolean {
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_PREFIX + runKey, false)
    }

    private fun sendNotification(ctx: Context, title: String, body: String, deepLink: String): Boolean {
        return try {
            ensureChannel(ctx)
            val intent = Intent(ctx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                data = Uri.parse(deepLink)
            }
            val pi = PendingIntent.getActivity(
                ctx,
                System.currentTimeMillis().toInt(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            NotificationManagerCompat.from(ctx).notify(System.currentTimeMillis().toInt(), notif)
            true
        } catch (e: Exception) {
            android.util.Log.e("GM_GATEWAY", "send failed: ${e.message}")
            false
        }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "编译完成通知",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "workflow 编译完成或失败时提醒"
                setShowBadge(true)
            }
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun cleanupIfNeeded(prefs: SharedPreferences) {
        val counter = prefs.getInt("write_counter", 0) + 1
        if (counter < CLEANUP_INTERVAL) {
            prefs.edit().putInt("write_counter", counter).apply()
            return
        }
        val keys = prefs.all.keys.filter { it.startsWith(KEY_PREFIX) }
        if (keys.size <= MAX_RECORDS) {
            prefs.edit().putInt("write_counter", 0).apply()
            return
        }
        // 保留前 MAX_RECORDS 个（SharedPreferences 无时间序，简单截断）
        val toRemove = keys.take(keys.size - MAX_RECORDS)
        val editor = prefs.edit()
        toRemove.forEach { editor.remove(it) }
        editor.putInt("write_counter", 0).commit()
    }
}
