const Mediator = require("../lib/mediator");

const app = require("../lib/server");

let mediator = new Mediator();

mediator.start();
app.listen(2030);
