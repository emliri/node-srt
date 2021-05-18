#!/usr/bin/env node

"use strict";

const path = require('path');
const fs = require('fs');
const process = require('process');
const clone = require('git-clone');
const del = require('del');
const { spawnSync } = require('child_process');
const os = require('os');
const env = process.env;
const vparse = require('vparse');

const SRT_REPO = env.NODE_SRT_REPO || "https://github.com/Haivision/srt.git";
const SRT_CHECKOUT = "v1.4.2";

// Need to patch up env in macOS 10.15+ (Catalina and further)
// in order to link user-installed OpenSSL,
// not the system-owned libcrypto binary that
// will be found in paths by default (but not possible anymore
// now to use it by 3rd party linked programs).
// @see https://github.com/Eyevinn/node-srt/issues/10
const MACOS_10_15_LIBCRYPTO_CC_FLAGS_PKGCONF = {
  LDFLAGS: "-L/usr/local/opt/openssl/lib",
  CPPFLAGS: "-I/usr/local/opt/openssl/include",
  PKG_CONFIG_PATH: "/usr/local/opt/openssl/lib/pkgconfig"
};

const srtRepoPath = env.NODE_SRT_LOCAL_REPO ? `file://${path.join(__dirname, env.NODE_SRT_LOCAL_REPO)}` : SRT_REPO;
const srtCheckout = env.NODE_SRT_CHECKOUT || SRT_CHECKOUT;

const depsPath = path.join(__dirname, '../', 'deps');
const srtSourcePath = path.join(depsPath, 'srt');
const buildDir = path.join(depsPath, 'build');
const numCpus = os.cpus().length; // NOTE: not the actual physical cores amount btw, see https://www.npmjs.com/package/physical-cpu-count

if (!fs.existsSync(depsPath)) {
  console.log('Creating dir:', depsPath)
  fs.mkdirSync(depsPath);
}

if (!fs.existsSync(srtSourcePath)) {
  console.log(`Cloning ${srtRepoPath}#${srtCheckout}`);
  clone(srtRepoPath, srtSourcePath, { checkout: srtCheckout }, (err) => {

    if (err) {
      console.error(err.message);
      if (fs.existsSync(srtSourcePath)) del.sync(srtSourcePath);
      process.exit(1);
    }

    build();
  });
} else {
  build();
}

function build() {
  const platform = os.platform();
  const osRelease = os.release();
  switch (platform) {
  case "win32":
    console.log('Building SRT SDK and prerequisites for current platform:', platform);
    buildWin32();
    break;
  default:
    if (platform === 'darwin' && osRelease) {
      const {major: darwinMajor} = vparse(osRelease);
      // see https://en.wikipedia.org/wiki/Darwin_%28operating_system%29#Release_history
      // for mapping Darwin <-> macOS releases
      // Catalina = Darwin v19
      if (darwinMajor >= 19) {
        console.warn('Applying env-vars hack to fix Darwin issue linking libcrypto dylib. See https://github.com/Eyevinn/node-srt/issues/10', MACOS_10_15_LIBCRYPTO_CC_FLAGS_PKGCONF);
        console.warn('This seems to address the most common case (user-opt installed, for example via Homebrew). If the above isn`t exactly what you want (you may use a different OpenSSL installation location, or a different library vendor alltogher), please modify the build-script.')
        Object.assign(env, MACOS_10_15_LIBCRYPTO_CC_FLAGS_PKGCONF);
      }
    }
    console.log('Building SRT SDK for current platform:', platform);
    buildNx();
  }
}

function buildWin32() {

  Object.assign(env, {
    SRT_ROOT: srtSourcePath
  });

  fs.mkdirSync(buildDir);

  console.log("Building OpenSSL");
  const openssl = spawnSync('vcpkg', [ 'install', 'openssl', '--triplet', `${process.arch}-windows` ], { cwd: process.env.VCPKG_ROOT, shell: true });
  if (openssl.stdout)
    console.log(openssl.stdout.toString());
  if (openssl.status) {
    console.log(openssl.stderr.toString());
    process.exit(openssl.status);
  }

  console.log("Building pthreads");
  const pthreads = spawnSync('vcpkg', [ 'install', 'pthreads', '--triplet', `${process.arch}-windows` ], { cwd: process.env.VCPKG_ROOT, shell: true } );
  if (pthreads.stdout)
    console.log(pthreads.stdout.toString());
  if (pthreads.status) {
    console.log(pthreads.stderr.toString());
    process.exit(pthreads.status);
  }

  console.log("Integrate vcpkg build system");
  const integrate = spawnSync('vcpkg', [ 'integrate', 'install' ], { cwd: process.env.VCPKG_ROOT, shell: true } );
  if (integrate.stdout)
    console.log(integrate.stdout.toString());
  if (integrate.status) {
    console.log(integrate.stderr.toString());
    process.exit(integrate.status);
  }

  console.log("Running cmake generator");
  const generator = spawnSync('cmake', [ srtSourcePath, '-DCMAKE_BUILD_TYPE=Release', '-G"Visual Studio 16 2019"', '-A', process.arch, '-DCMAKE_TOOLCHAIN_FILE="%VCPKG_ROOT%\\scripts\\buildsystems\\vcpkg.cmake' ], { cwd: buildDir, shell: true } );
  if (generator.stdout)
    console.log(generator.stdout.toString());
  if (generator.status) {
    console.log(generator.stderr.toString());
    process.exit(generator.status);
  }

  console.log("Running CMake build");
  const build = spawnSync('cmake', [ '--build', buildDir, '--config', 'Release' ], { cwd: buildDir, shell: true } );
  if (build.stdout)
    console.log(build.stdout.toString());
  if (build.status) {
    console.log(build.stderr.toString());
    process.exit(build.status);
  }
}

function buildNx() {

  console.log("Running ./configure");
  const configure = spawnSync('./configure', [ '--prefix', buildDir ], { cwd: srtSourcePath, shell: true, stdio: 'inherit' } );
  if (configure.status) {
    process.exit(configure.status);
  }

  console.log("Running make with threads:", numCpus);
  const make = spawnSync('make', [`-j${numCpus}`], { cwd: srtSourcePath, shell: true, stdio: 'inherit' });
  if (make.status) {
    process.exit(make.status);
  }

  console.log("Running make install");
  const install = spawnSync('make', ['install'], { cwd: srtSourcePath, shell: true, stdio: 'inherit' });
  if (install.status) {
    process.exit(install.status);
  }
}
