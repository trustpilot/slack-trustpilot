var gulp = require('gulp');
var jshint = require('gulp-jshint');

spawn = require('child_process').spawn;
var node;

gulp.task('local', function() {
  if (node) node.kill()
  var env = Object.create( process.env );
  env.ENABLE_LOCAL_TUNNEL = 'true';
  node = spawn('node', ['src/index.js'], {stdio: 'inherit', env: env });
  node.on('close', function (code) {
    if (code === 8) {
      gulp.log('Error detected, waiting for changes...');
    }
  });
});

gulp.task('watch', ['local'], function() {
    gulp.watch('src/**/*.js', ['local']);
});

gulp.task('lint', function() {
  return gulp.src('src/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});