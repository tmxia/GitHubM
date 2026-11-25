package com.github.manager

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * ThemeUtils 单元测试
 *
 * 使用 Robolectric 运行，以便在 JVM 上解析 android.graphics.Color。
 *
 * 覆盖场景：
 *  parseColorSafe：
 *    1. 合法 6 位 hex 返回颜色 Int
 *    2. 合法 8 位 hex（含 alpha）返回颜色 Int
 *    3. 非法 hex 字符串返回 null（不抛异常）
 *    4. 空字符串返回 null
 *    5. 不带 # 的颜色字符串返回 null
 *
 *  unselectedNavColor：
 *    6. 深色模式返回深色未选中色
 *    7. 浅色模式返回浅色未选中色
 *    8. 深色/浅色返回值不同
 *
 *  isValidHexColor：
 *    9.  合法颜色返回 true
 *   10. 非法颜色返回 false
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ThemeUtilsTest {

    // ── parseColorSafe ───────────────────────────────────────────────

    @Test
    fun `合法6位hex颜色返回非null颜色值`() {
        val color = ThemeUtils.parseColorSafe("#7c3aed")
        assertNotNull(color)
    }

    @Test
    fun `合法8位hex颜色含alpha返回非null颜色值`() {
        val color = ThemeUtils.parseColorSafe("#FF8B4CF8")
        assertNotNull(color)
    }

    @Test
    fun `多种合法颜色字符串均可解析`() {
        val validColors = listOf(
            "#8B4CF8", "#1d6be3", "#16a34a",
            "#f97316", "#e11d48", "#0891b2",
            "#ffffff", "#000000",
        )
        for (hex in validColors) {
            assertNotNull(ThemeUtils.parseColorSafe(hex), "应能解析: $hex")
        }
    }

    @Test
    fun `非法hex字符串返回null不抛异常`() {
        val result = ThemeUtils.parseColorSafe("not-a-color")
        assertNull(result)
    }

    @Test
    fun `空字符串返回null`() {
        val result = ThemeUtils.parseColorSafe("")
        assertNull(result)
    }

    @Test
    fun `不带井号的颜色字符串返回null`() {
        val result = ThemeUtils.parseColorSafe("7c3aed")
        assertNull(result)
    }

    @Test
    fun `3位短hex返回null（Android不支持3位hex）`() {
        // Android Color.parseColor 不支持 3 位 hex
        val result = ThemeUtils.parseColorSafe("#fff")
        assertNull(result)
    }

    // ── unselectedNavColor ───────────────────────────────────────────

    @Test
    fun `深色模式返回深色未选中色常量`() {
        assertEquals(ThemeUtils.UNSELECTED_DARK, ThemeUtils.unselectedNavColor(true))
    }

    @Test
    fun `浅色模式返回浅色未选中色常量`() {
        assertEquals(ThemeUtils.UNSELECTED_LIGHT, ThemeUtils.unselectedNavColor(false))
    }

    @Test
    fun `深色和浅色未选中色不同`() {
        val dark  = ThemeUtils.unselectedNavColor(true)
        val light = ThemeUtils.unselectedNavColor(false)
        assertTrue(dark != light, "深色和浅色未选中色应不同")
    }

    @Test
    fun `深色未选中色透明度为FF（不透明）`() {
        // 0xFF9292A8 → alpha = 0xFF
        val alpha = (ThemeUtils.UNSELECTED_DARK ushr 24) and 0xFF
        assertEquals(0xFF, alpha)
    }

    @Test
    fun `浅色未选中色透明度为FF（不透明）`() {
        val alpha = (ThemeUtils.UNSELECTED_LIGHT ushr 24) and 0xFF
        assertEquals(0xFF, alpha)
    }

    // ── isValidHexColor ──────────────────────────────────────────────

    @Test
    fun `合法hex颜色isValidHexColor返回true`() {
        assertTrue(ThemeUtils.isValidHexColor("#8B4CF8"))
    }

    @Test
    fun `非法颜色字符串isValidHexColor返回false`() {
        assertFalse(ThemeUtils.isValidHexColor("invalid"))
    }

    @Test
    fun `空字符串isValidHexColor返回false`() {
        assertFalse(ThemeUtils.isValidHexColor(""))
    }

    // ── resolveAccentColor 历史莫奈紫残留归一 ────────────────────────

    @Test
    fun `旧莫奈紫6750A4归一为品牌纯紫`() {
        assertEquals(ThemeUtils.DEFAULT_BRAND_PURPLE, ThemeUtils.resolveAccentColor("#6750A4"))
    }

    @Test
    fun `上游旧默认8461B8归一为品牌纯紫`() {
        assertEquals(ThemeUtils.DEFAULT_BRAND_PURPLE, ThemeUtils.resolveAccentColor("#8461B8"))
    }

    @Test
    fun `莫奈副色9A82DB归一为品牌纯紫`() {
        assertEquals(ThemeUtils.DEFAULT_BRAND_PURPLE, ThemeUtils.resolveAccentColor("#9A82DB"))
    }

    @Test
    fun `品牌纯紫保持不变`() {
        assertEquals(
            ThemeUtils.parseColorSafe("#7c3aed"),
            ThemeUtils.resolveAccentColor("#7c3aed")
        )
    }

    @Test
    fun `其他合法主题色保持原样跟随`() {
        assertEquals(
            ThemeUtils.parseColorSafe("#16a34a"),
            ThemeUtils.resolveAccentColor("#16a34a")
        )
    }

    @Test
    fun `null颜色兜底品牌纯紫`() {
        assertEquals(ThemeUtils.DEFAULT_BRAND_PURPLE, ThemeUtils.resolveAccentColor(null))
    }

    @Test
    fun `非法颜色字符串兜底品牌纯紫`() {
        assertEquals(ThemeUtils.DEFAULT_BRAND_PURPLE, ThemeUtils.resolveAccentColor("not-a-color"))
    }

    @Test
    fun `isLegacyMonetPurple识别历史莫奈紫且忽略alpha`() {
        assertTrue(ThemeUtils.isLegacyMonetPurple(0xFF6750A4.toInt()))
        assertTrue(ThemeUtils.isLegacyMonetPurple(0x806750A4.toInt()))
        assertFalse(ThemeUtils.isLegacyMonetPurple(0xFF7C3AED.toInt()))
        assertFalse(ThemeUtils.isLegacyMonetPurple(0xFF16A34A.toInt()))
    }
}
