import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeEnv = { ...process.env, CAPACITOR_WEB_DIR: '.angular/mobile/browser' };
const mode = process.argv[2] ?? 'sync';
if (!['sync', 'build', 'run', 'open'].includes(mode)) throw new Error('Use sync, build, run or open.');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: nativeEnv, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === 'build' || mode === 'run') {
  const pathJava = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
  const pathJavaHome = /java\.home\s*=\s*([^\r\n]+)/.exec(`${pathJava.stderr ?? ''}${pathJava.stdout ?? ''}`)?.[1]?.trim();
  const javaCandidates = [
    nativeEnv.JAVA_HOME,
    pathJavaHome,
    process.platform === 'win32' ? 'C:/Program Files/Android/Android Studio/jbr' : undefined,
  ].filter(Boolean);
  const javaHome = javaCandidates.find((candidate) => {
    const java = join(candidate, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
    const version = /version "(\d+)/.exec(`${result.stderr ?? ''}${result.stdout ?? ''}`);
    // The project's Gradle 8.14 wrapper supports Java through version 24.
    return result.status === 0 && version && Number(version[1]) >= 21 && Number(version[1]) <= 24;
  });
  if (!javaHome) throw new Error('Set JAVA_HOME to a JDK from version 21 through 24 (JDK 21 recommended). This Gradle wrapper does not support Java 25 or newer.');
  nativeEnv.JAVA_HOME = javaHome;
  const sdkCandidates = [
    nativeEnv.ANDROID_HOME, nativeEnv.ANDROID_SDK_ROOT,
    nativeEnv.LOCALAPPDATA ? join(nativeEnv.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
  ].filter(Boolean);
  const sdk = sdkCandidates.find((candidate) => existsSync(join(candidate, 'platforms', 'android-36', 'android.jar')));
  if (!sdk) throw new Error('Install Android SDK Platform 36 in Android Studio and set ANDROID_HOME to the SDK directory.');
  nativeEnv.ANDROID_HOME = sdk;
  console.log(`Android build tools: Java ${javaHome}; SDK ${sdk}`);
}

// Keep native bundles separate from the checked-in browser build in www.
run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', '--output-path', '.angular/mobile']);
const capacitor = ['node_modules/@capacitor/cli/bin/capacitor'];
if (!existsSync(join(root, 'android'))) run(process.execPath, [...capacitor, 'add', 'android']);
run(process.execPath, [...capacitor, 'sync', 'android']);

if (mode === 'open' || mode === 'run') {
  run(process.execPath, [...capacitor, mode, 'android', ...process.argv.slice(3)]);
} else if (mode === 'build') {
  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleDebug'], join(root, 'android'));
  } else {
    run('./gradlew', ['assembleDebug'], join(root, 'android'));
  }
  const artifact = join(root, 'artifacts', 'DairyDash-debug.apk');
  mkdirSync(dirname(artifact), { recursive: true });
  copyFileSync(join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'), artifact);
  console.log(`Android test APK: ${artifact}`);
}
