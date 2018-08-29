exports.seed = async knex => {
  await knex("devices").del();

  return await knex("devices").insert(
    [
      {
        name: "proxy.server",
        address: "146.135.192.2",
        descr: "Proxy server",
        disabled: 0
      },
      {
        name: "localhost",
        address: "127.0.0.1",
        descr: "Localhost",
        disabled: 0
      },
      {
        name: "gateway",
        address: "192.168.120.1",
        descr: "Default Gateway",
        disabled: 0
      },
      {
        name: "Unreachable",
        address: "10.2.3.4",
        descr: "An unreachable endpoint",
        disabled: 0
      }
    ],
    2
  );
};
