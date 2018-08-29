const cp = require("child_process");
const COUNT = 1;
const TIMEOUT = 1;

exports.ping = async function(host) {
  return new Promise((resolve, reject) => {
    let start = Date.now();
    cp.exec(
      ["ping", "-c", COUNT, "-W", TIMEOUT, host].join(" "),
      (err, stdout, stderr) => {
        let end = Date.now();

        if (err) return reject(new Error("unreachable"));

        return resolve({ rtt: end - start, host });
      }
    );
  });
};
