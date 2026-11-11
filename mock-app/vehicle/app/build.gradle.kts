plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.waymate.app"
    compileSdk = 35
    useLibrary("android.car")
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.waymate.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
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

    buildFeatures {
        compose = true
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
    "realImplementation"(libs.pleos.navihelper)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

val copyCharacter by tasks.registering(Copy::class) {
    from("../../assets/images/characters/blue-dragon-v1/reference.png")
    into(layout.buildDirectory.dir("generated/character-res/drawable-nodpi"))
    rename { "blue_dragon.png" }
}
tasks.named("preBuild") { dependsOn(copyCharacter) }
