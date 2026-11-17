pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        // ── 镜像源（必须前置，原因见下）─────────────────────────────
        // 现象：CI 配置阶段失败
        //   Could not GET 'https://repo.maven.apache.org/maven2/...'
        //     -> Received status code 403 from server: Forbidden
        //   Could not GET 'https://plugins.gradle.org/m2/...'
        //     -> Received status code 403 from server: Forbidden
        //
        // 原因：Maven Central 按出口 IP 拦截 GitHub Actions 的共享 IP 段，
        //   返回 403（不是 429 限流）。gradle.properties 里的
        //   max.tentatives / connectionTimeout 对 403 无效，Gradle 不会重试。
        //   唯一有效解法：在源头加镜像，让解析根本不走 central。
        //
        // 顺序：Google 托管的 Central 镜像（境外 runner 最稳）
        //       -> 阿里云插件源 -> 阿里云公共源 -> mavenCentral() 兜底
        maven {
            name = "MavenCentralGoogleMirror"
            url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
        }
        maven {
            name = "AliyunGradlePlugin"
            url = uri("https://maven.aliyun.com/repository/gradle-plugin")
        }
        maven {
            name = "AliyunPublic"
            url = uri("https://maven.aliyun.com/repository/public")
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // 同上的镜像策略：模块依赖解析也会撞上 403
        maven {
            name = "MavenCentralGoogleMirror"
            url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
        }
        maven {
            name = "AliyunPublic"
            url = uri("https://maven.aliyun.com/repository/public")
        }
        mavenCentral()
    }
}

rootProject.name = "GitHubManager"
include(":app")
