package com.github.manager

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.content.ContextCompat

/**
 * 通知图标位图生成工具。
 */
object NotificationIcons {

    private fun dp(context: Context, dp: Float): Int = 
        (dp * context.resources.displayMetrics.density + 0.5f).toInt()

    fun largeIconBitmap(context: Context, accentColor: Int): Bitmap? = runCatching {
        android.util.Log.d("GM_ICON", "Drawing largeIcon with color: #${Integer.toHexString(accentColor)}")
        
        val size = dp(context, 64f)
        val radius = dp(context, 16f).toFloat()
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        
        // 1. 绘制纯色（传入的主题色）圆角背景
        val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accentColor }
        canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, background)

        // 2. 绘制纯白色的猫头剪影 (使用 splash_logo)
        ContextCompat.getDrawable(context, R.drawable.splash_logo)?.let { cat ->
            val pad = dp(context, 15f)
            val inner = size - pad * 2
            cat.setBounds(pad, pad, pad + inner, pad + inner)
            cat.draw(canvas)
        }
        
        bitmap
    }.getOrNull()
}
