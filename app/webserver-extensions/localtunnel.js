const localtunnel = require('localtunnel');

module.exports = function (port) {
  localtunnel(port, (err, tunnel) => {
    if (err) {
      throw err;
    }

    console.log('Tunnel started at', tunnel.url);

    tunnel.on('close', () => {
      console.error('Your tunnel was closed.');
      process.exit();
    });
  });
};
