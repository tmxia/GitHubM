package com.github.manager

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 后台定时检查编译看板监控的 workflow 状态。
 * 每 15 分钟由 WorkManager 触发一次，检测到 workflow 从"进行中"变为"已完成"时发通知。
 *
 * 监控配置由前端通过 AndroidBridge.syncMonitorConfig(json) 写入 SharedPreferences("gm_monitor")。
 * JSON 结构：
 * {
 *   "notifyEnabled": true,
 *   "token": "ghp_xxx",
 *   "repos": [
 *     { "fullName": "owner/repo", "workflowId": 123, "workflowName": "Build" }
 *   ],
 *   "lastStatus": { "repo/workflowId": "in_progress" }  // 上次状态，运行时更新
 * }
 */
class CompileMonitorWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    override fun doWork(): Result {
        return try {
            val prefs = applicationContext.getSharedPreferences("gm_monitor", Context.MODE_PRIVATE)
            val configJson = prefs.getString("config", null) ?: return Result.success()

            val config = JSONObject(configJson)
            if (!config.optBoolean("notifyEnabled", true)) return Result.success()

            val token = config.optString("token", "")
            if (token.isEmpty()) return Result.success()

            val repos = config.optJSONArray("repos") ?: return Result.success()
            val lastStatus = config.optJSONObject("lastStatus") ?: JSONObject()
            val newStatus = JSONObject()

            for (i in 0 until repos.length()) {
                val item = repos.getJSONObject(i)
                val fullName = item.getString("fullName")
                val workflowId = item.getInt("workflowId")
                val workflowName = item.optString("workflowName", fullName)
                val targetRunId = item.optLong("targetRunId", 0L)

                val key = "$fullName/$workflowId"
                val prev = lastStatus.optString(key, "")
                val current = fetchLatestRunStatus(fullName, workflowId, token)
                val latestRunId = fetchLatestRunId(fullName, workflowId, token)

                if (current.isNotEmpty()) {
                    newStatus.put(key, current)
                    val wasRunning = prev == "in_progress" || prev == "queued"
                    val nowDone = current == "completed"
                    val matchedTarget = targetRunId > 0L && latestRunId == targetRunId
                    val firstCheckDone = prev.isEmpty() && nowDone && matchedTarget
                    if ((wasRunning && nowDone) || firstCheckDone) {
                        // 用 runId 生成去重 key
                        val notifKey = "$fullName@$latestRunId"
                        val conclusion = fetchLatestRunConclusion(fullName, workflowId, token)
                        val ok = conclusion == "success"
                        val title = "${if (ok) "✅" else "❌"} $workflowName 编译${if (ok) "成功" else "失败"}"
                        val body = "$fullName，点击查看"
                        val deepLink = "githubmanager://repos/$fullName/actions"
                        // 唯一出口：无论前端还是后台，都走这一条路
                        NotificationGateway.tryNotify(
                            applicationContext,
                            notifKey,
                            title,
                            body,
                            deepLink,
                        )
                    }
                }
            }

            // 保存最新状态
            config.put("lastStatus", newStatus)
            prefs.edit().putString("config", config.toString()).apply()

            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("GM_WORKER", "doWork failed: ${e.message}")
            // 不 retry（避免指数退避拖长周期）
            Result.success()
        }
    }

    private fun fetchLatestRunStatus(fullName: String, workflowId: Int, token: String): String {
        return try {
            val url = URL("https://api.github.com/repos/$fullName/actions/workflows/$workflowId/runs?per_page=1")
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "GitHubManagerApp")
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            val runs = json.optJSONArray("workflow_runs")
            if (runs != null && runs.length() > 0) {
                runs.getJSONObject(0).optString("status", "")
            } else ""
        } catch (e: Exception) {
            android.util.Log.e("GM_WORKER", "fetchStatus failed: ${e.message}")
            ""
        }
    }

    private fun fetchLatestRunId(fullName: String, workflowId: Int, token: String): Long {
        return try {
            val url = URL("https://api.github.com/repos/$fullName/actions/workflows/$workflowId/runs?per_page=1")
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "GitHubManagerApp")
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            val runs = json.optJSONArray("workflow_runs")
            if (runs != null && runs.length() > 0) {
                runs.getJSONObject(0).optLong("id", 0L)
            } else 0L
        } catch (e: Exception) {
            0L
        }
    }

    private fun fetchLatestRunConclusion(fullName: String, workflowId: Int, token: String): String {
        return try {
            val url = URL("https://api.github.com/repos/$fullName/actions/workflows/$workflowId/runs?per_page=1")
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "GitHubManagerApp")
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            val runs = json.optJSONArray("workflow_runs")
            if (runs != null && runs.length() > 0) {
                runs.getJSONObject(0).optString("conclusion", "")
            } else ""
        } catch (e: Exception) {
            ""
        }
    }

}
