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

            // ⚠️ 先发送；只有成功才写去重标记（失败可重试）
            val sent = sendNotification(ctx, runKey, title, body, deepLink)
            if (sent) {
                prefs.edit().putBoolean(key, true).commit()
                cleanupIfNeeded(prefs)
            } else {
                android.util.Log.w("GM_GATEWAY", "not sent, will retry: $runKey")
            }
            return sent
        }
    }

    /** 检查某 runKey 是否已通知过（供前端查询） */
    fun isNotified(ctx: Context, runKey: String): Boolean {
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_PREFIX + runKey, false)
    }

    private fun sendNotification(
        ctx: Context,
        runKey: String,
        title: String,
        body: String,
        deepLink: String,
    ): Boolean {
        return try {
            // ① 权限检查（Android 13+）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = androidx.core.content.ContextCompat.checkSelfPermission(
                    ctx, android.Manifest.permission.POST_NOTIFICATIONS
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    android.util.Log.w("GM_GATEWAY", "POST_NOTIFICATIONS not granted, skip")
                    return false
                }
            }

            ensureChannel(ctx)

            // ② 通道是否被用户禁用
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = ctx.getSystemService(NotificationManager::class.java)
                val ch = nm.getNotificationChannel(CHANNEL_ID)
                if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) {
                    android.util.Log.w("GM_GATEWAY", "channel disabled by user, skip")
                    return false
                }
            }

            val intent = Intent(ctx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                data = Uri.parse(deepLink)
            }
            val notifId = runKey.hashCode()
            val pi = PendingIntent.getActivity(
                ctx,
                notifId,
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
            NotificationManagerCompat.from(ctx).notify(notifId, notif)
            android.util.Log.d("GM_GATEWAY", "sent: $runKey id=$notifId")
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
