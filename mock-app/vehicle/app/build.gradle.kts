import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val apiPort = providers.gradleProperty("waymateApiPort").orElse("3000").get().toInt().also { require(it in 1024..65535) }
val personalApiPort = providers.gradleProperty("waymatePersonalApiPort").orElse("3004").get().toInt().also { require(it in 1024..65535) }
val drivingSourceDirectory = layout.buildDirectory.dir("generated/driving-policy-source")
val drivingTestResources = layout.buildDirectory.dir("generated/driving-policy-test-resources")
val recommendationSourceDirectory = layout.buildDirectory.dir("generated/driving-recommendation-source")

android {
    namespace = "com.waymate.app"
    compileSdk = 35
    useLibrary("android.car")
    buildToolsVersion = "35.0.0"

    defaultConfig {
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:$apiPort\"")
        buildConfigField("String", "PERSONAL_API_BASE_URL", "\"http://10.0.2.2:$personalApiPort\"")
        applicationId = "com.waymate.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "environment"
    productFlavors {
        create("real") {
            dimension = "environment"
            applicationIdSuffix = ".real"
            versionNameSuffix = "-real"
        }
        create("mock") {
            dimension = "environment"
            applicationIdSuffix = ".mock"
            versionNameSuffix = "-mock"
        }
    }

    sourceSets["main"].res.srcDir(layout.buildDirectory.dir("generated/character-res"))
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/speech-assets"))
    sourceSets["main"].java.srcDir(drivingSourceDirectory)
    sourceSets["main"].java.srcDir(recommendationSourceDirectory)
    sourceSets["test"].resources.srcDir(drivingTestResources)
    androidResources { noCompress += "m4a" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencyLocking {
    lockAllConfigurations()
}

dependencies {
    testImplementation(libs.junit)
    "realImplementation"(libs.pleos.navihelper)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
}

val copyCharacter by tasks.registering(Copy::class) {
    from("../../assets/images/design-v5/dragon.png")
    into(layout.buildDirectory.dir("generated/character-res/drawable-nodpi"))
    rename { "blue_dragon.png" }
}
val copyBear by tasks.registering(Copy::class) {
    from("../../assets/images/design-v5/rumit.png")
    into(layout.buildDirectory.dir("generated/character-res/drawable-nodpi"))
    rename { "travel_bear.png" }
}
val copyMocha by tasks.registering(Copy::class) {
    from("../../assets/images/design-v5/bear-legacy.png")
    into(layout.buildDirectory.dir("generated/character-res/drawable-nodpi"))
    rename { "travel_mocha.png" }
}
tasks.named("preBuild") { dependsOn(copyCharacter, copyBear, copyMocha) }

val copyCompanionLogo by tasks.registering(Copy::class) {
    from("../../../shared/design/assets/durumit-logo-transparent.png")
    into(layout.buildDirectory.dir("generated/character-res/drawable-nodpi"))
    rename { "durumit_wordmark.png" }
}
tasks.named("preBuild") { dependsOn(copyCompanionLogo) }

val copyPreparedSpeech by tasks.registering(Copy::class) {
    from("../../assets/audio/prepared-v1")
    into(layout.buildDirectory.dir("generated/speech-assets/speech"))
}
tasks.named("preBuild") { dependsOn(copyPreparedSpeech) }

// The server reads this same JSON. Generate the native policy; do not maintain another mask list.
val generateDrivingProfiles by tasks.registering {
    val policy = layout.projectDirectory.file("../../shared/config/driving-policy.json")
    inputs.file(policy)
    outputs.dir(drivingSourceDirectory)
    outputs.dir(drivingTestResources)
    doLast {
        val data = JsonSlurper().parse(policy.asFile) as Map<*, *>
        require(data["schemaVersion"] == 1)
        val masks = (data["allowedMasks"] as List<*>).map {
            require(it is Number && it.toDouble() == it.toInt().toDouble())
            it.toInt().also { value -> require(value in 0..511) }
        }
        require(masks.isNotEmpty() && masks.distinct().size == masks.size)
        val output = drivingSourceDirectory.get().file("com/waymate/app/platform/restrictions/DrivingProfiles.kt").asFile
        output.parentFile.mkdirs()
        output.writeText("package com.waymate.app.platform.restrictions\n\n" +
            "// Generated from shared/config/driving-policy.json.\n" +
            "internal object DrivingProfiles { val allowedMasks: Set<Int> = setOf(${masks.joinToString(", ")}) }\n")
        val resource = drivingTestResources.get().file("driving-policy.json").asFile
        resource.parentFile.mkdirs()
        policy.asFile.copyTo(resource, overwrite = true)
    }
}
tasks.named("preBuild") { dependsOn(generateDrivingProfiles) }

val generateDrivingRecommendations by tasks.registering {
    val samples = layout.projectDirectory.file("../../shared/config/driving-recommendations.json")
    inputs.file(samples)
    outputs.dir(recommendationSourceDirectory)
    doLast {
        val data = JsonSlurper().parse(samples.asFile) as Map<*, *>
        require(data["schemaVersion"] == 1)
        val entries = data["entries"] as List<*>
        val fields = listOf("id", "query", "placeName", "summary", "total", "reason", "narration")
        val rows = entries.map { entry ->
            val row = entry as Map<*, *>
            "DrivingRecommendation(" + fields.joinToString(", ") { field ->
                val value = row[field] as String
                require(value.isNotBlank())
                groovy.json.JsonOutput.toJson(value).replace("\$", "\\\$")
            } + ")"
        }
        val output = recommendationSourceDirectory.get().file("com/waymate/app/model/DrivingRecommendations.kt").asFile
        output.parentFile.mkdirs()
        output.writeText("package com.waymate.app.model\n\n" +
            "// Generated from shared/config/driving-recommendations.json, also used by the audio generator.\n" +
            "object DrivingRecommendations {\n" +
            "    val entries = listOf(${rows.joinToString(",\n        ")})\n" +
            "    fun forQuery(query: String?) = entries.firstOrNull { it.query == query }\n" +
            "    fun allowsNarration(text: String) = entries.any { it.narration == text }\n" +
            "}\n")
    }
}
tasks.named("preBuild") { dependsOn(generateDrivingRecommendations) }
