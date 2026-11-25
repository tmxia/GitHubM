package com.github.manager

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.content.ContextCompat

/**
 * 通知图标位图生成工具。
 *
 * 通知条目左侧默认由系统回退取应用 launcher 图标；在部分 ROM 上会命中旧版图标缓存，
 * 导致包更新后仍显示历史莫奈紫。这里主动渲染一张「当前主题色圆角底 + 白猫剪影」大图，
 * 通过 setLargeIcon 提供给通知，覆盖系统回退的旧缓存图标。
 */
object NotificationIcons {

    private fun dp(context: Context, dp: Float): Int =
        (dp * context.resources.displayMetrics.density + 0.5f).toInt()

    /**
     * 生成通知大图位图（主题色圆角底 + 白猫剪影）。
     * @return 渲染成功返回位图；任何异常返回 null，调用方回退系统默认行为。
     */
    fun largeIconBitmap(context: Context, accentColor: Int): Bitmap? = runCatching {
    android.util.Log.d("GM_ICON", "Drawing largeIcon with color: #${Integer.toHexString(accentColor)}")
        val size = dp(context, 64f)
        val radius = dp(context, 16f).toFloat()
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accentColor }
        canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, background)

        ContextCompat.getDrawable(context, R.drawable.splash_logo)?.let { cat ->
            val pad = dp(context, 15f)
            val inner = size - pad * 2
            cat.setBounds(pad, pad, pad + inner, pad + inner)
            cat.draw(canvas)
        }
        bitmap
    }.getOrNull()
}
