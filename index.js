const chalk = require("chalk");
const moment = require("moment");
const _ = require("lodash");
const clear = require("clear");
const Configstore = require("configstore");
const inquirer = require("inquirer");
require("request");
//exchanges
const binance = require("binance-api-node").default;

const Gdax = require("gdax");
const websocket = new Gdax.WebsocketClient(["BTC-USD"]);
const BFX = require("bitfinex-api-node");
const bfx = new BFX({
  apiKey: "...",
  apiSecret: "...",
  ws: {
    autoReconnect: true,
    seqAudit: true,
    packetWDDelay: 10 * 1000,
  },
});
var OKEX = require("okex-rest");
var okexClient = new OKEX();

const APIKEY = "";
const APISECRET = "";

let recentTrades = [];
let bitcoinPricesMin = [];
let tradesIn = 0;
let tradesOut = 0;
let totalTradesIn = 0;
let totalTradesOut = 0;
let totalTrades = 0;
let bitcoinAvg = 0;
let bitcoinTxCount = 0;
let size = 0.1;
const client = binance({
  apiKey: APIKEY,
  apiSecret: APISECRET,
});

clear();

var viewRequest = [
  {
    type: "list",
    name: "menu",
    default: 0,
    message: chalk.cyan("What to do?"),
    choices: ["Monitor BTC", "Quit Bot"],
  },
];

var monitor_input = [
  {
    type: "input",
    name: "size",
    message: chalk.cyan("Enter BTC Size Trigger"),
    default: 0,
    validate: function (value) {
      var valid = !isNaN(parseFloat(value)) && value >= 0;
      return valid || "Please enter a number >= 0";
    },
  },
];

async function numberWithCommas(x) {
  if (x !== 0) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  } else {
    return "0";
  }
}

ask_initial_request = () => {
  console.log(" ");
  inquirer.prompt(viewRequest).then((answer) => {
    if (answer.menu === "Monitor BTC") {
      inquirer.prompt(monitor_input).then((answers) => {
        size = answers.size;
        monitor_gdax();
        monitor_bitmex();
        monitor_bfx();
        monitor_binance();
        setInterval(async function () {
          calculateBitcoinAvg();
          totalTrades += bitcoinTxCount;
          totalTradesIn += tradesIn;
          totalTradesOut += tradesOut;
          let tradesInStr = tradesIn.toFixed();
          let tradesOutStr = tradesOut.toFixed();
          let net = tradesIn - tradesOut;
          let vol = tradesIn + tradesOut;
          let formatNet = await numberWithCommas(
            Number(Math.abs(net).toFixed())
          );
          let formatVol = await numberWithCommas(
            Number(Math.abs(vol).toFixed())
          );
          let bought = await numberWithCommas(tradesInStr);
          let sold = await numberWithCommas(tradesOutStr);
          let formatTotalIn = await numberWithCommas(
            Number(Math.abs(totalTradesIn).toFixed())
          );
          let formatTotalOut = await numberWithCommas(
            Number(Math.abs(totalTradesOut).toFixed())
          );
          let totalNet = totalTradesIn - totalTradesOut;
          let formatTotalNet = await numberWithCommas(
            Number(Math.abs(totalNet).toFixed())
          );
          let totalVol = totalTradesIn + totalTradesOut;
          let formatTotalVol = await numberWithCommas(
            Number(totalVol.toFixed())
          );
          if (net >= 0) {
            console.log(
              `1Minute Net Flow: $${formatNet} | Bought: $${bought} | Sold: $${sold} | Volume: $${formatVol} | Trades: ${bitcoinTxCount}`
            );
          } else {
            console.log(
              `1Minute Net Flow: -$${formatNet} | Bought: $${bought} | Sold: $${sold} | Volume: $${formatVol} | Trades: ${bitcoinTxCount}`
            );
          }
          if (totalNet >= 0) {
            console.log(
              `Session Net Flow: $${formatTotalNet} | Bought: $${formatTotalIn} | Sold: $${formatTotalOut} | Volume: $${formatTotalVol} | Trades: ${totalTrades}`
            );
          } else {
            console.log(
              `Session Net Flow: -$${formatTotalNet} | Bought: $${formatTotalIn} | Sold: $${formatTotalOut} | Volume: $${formatTotalVol} | Trades: ${totalTrades}`
            );
          }
          // if (bitcoinTxCount >= 100) {
          //   let text = {
          //     // To Number is the number you will be sending the text to.
          //     toNumber: '+X-XXX-XXX-XXXX',
          //     // From number is the number you will buy from your admin dashboard (https://www.puretext.us/dashboard/#/numbers)
          //     fromNumber: '+XXXXXXXXXXX',
          //     // Text Content
          //     smsBody: bitcoinTxCount + " TXS | $" + Number(bitcoinAvg).toFixed(2),
          //     //Sign up for an account to get an API Token (https://www.puretext.us/auth/google)
          //     apiToken: 'XXXXX'
          //   };

          //   puretext.send(text, function (err, response) { })
          // }
          bitcoinPricesMin = [];
          tradesIn = 0;
          tradesOut = 0;
          bitcoinTxCount = 0;
        }, 60000);
      });
    } else if (answer.menu === "Quit Bot") {
      process.exit();
    }
  });
};

monitor_gdax = async () => {
  websocket.on("message", async (data) => {
    if (
      data.side != null &&
      data.size != null &&
      data.price != null &&
      data.type == "match"
    ) {
      bitcoinPricesMin.push(Number(data.price));
      if (Number(data.size) >= size) {
        bitcoinTxCount += 1;
        const val = await numberWithCommas(
          Number(Math.abs(Number(data.price) * Number(data.size)).toFixed())
        );
        if (data.side == "buy") {
          tradesIn += Math.abs(
            Number((Number(data.price) * Number(data.size)).toFixed(2))
          );
          console.log(
            chalk.bold.green(
              moment(
                data.time.slice(
                  data.time.indexOf("T") + 1,
                  data.time.indexOf(".")
                ),
                "HH:mm:ss"
              )
                .subtract(
                  moment.duration({
                    hours: 5,
                  })
                )
                .format("HH:mm:ss") +
                " Exchange: GDAX     | Type: Buy  | BTC-USD: $" +
                Number(data.price).toFixed(2) +
                " | Quantity: " +
                Number(data.size).toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        } else {
          tradesOut += Math.abs(
            Number((Number(data.price) * Number(data.size)).toFixed(2))
          );
          console.log(
            chalk.bold.red(
              moment(
                data.time.slice(
                  data.time.indexOf("T") + 1,
                  data.time.indexOf(".")
                ),
                "HH:mm:ss"
              )
                .subtract(
                  moment.duration({
                    hours: 5,
                  })
                )
                .format("HH:mm:ss") +
                " Exchange: GDAX     | Type: Sell | BTC-USD: $" +
                Number(data.price).toFixed(2) +
                " | Quantity: " +
                Number(data.size).toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        }
      }
    }
  });
};

monitor_okex = () => {
  okexClient.getTrades(logResponse, "ltc_btc");
};

function logResponse(err, data) {
  if (err) {
    console.log("error name %s", err.name);
    console.log("error message %s", err);
  }

  console.log("\ndata: %s", JSON.stringify(data));
}

monitor_bfx = () => {
  const ws = bfx.ws();

  ws.on("error", (err) => console.log(err));
  ws.on("open", () => {
    ws.subscribeTrades("BTCUSD");
  });

  ws.onTrades(
    {
      pair: "BTCUSD",
    },
    async (trades) => {
      bitcoinPricesMin.push(Number(trades[trades.length - 1][3]));
      if (Math.abs(trades[trades.length - 1][2]) >= size) {
        bitcoinTxCount += 1;
        const val = await numberWithCommas(
          Number(
            Math.abs(
              trades[trades.length - 1][2] * trades[trades.length - 1][3]
            ).toFixed()
          )
        );
        if (trades[trades.length - 1][2] >= 0) {
          tradesIn += Math.abs(
            Number(
              (
                trades[trades.length - 1][2] * trades[trades.length - 1][3]
              ).toFixed(2)
            )
          );
          console.log(
            chalk.bold.green(
              moment(trades[trades.length - 1][1]).format("HH:mm:ss") +
                " Exchange: Bitfinex | Type: Buy  | BTC-USD: $" +
                trades[trades.length - 1][3].toFixed(2) +
                " | Quantity: " +
                trades[trades.length - 1][2].toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        } else {
          tradesOut += Math.abs(
            Number(
              (
                trades[trades.length - 1][2] * trades[trades.length - 1][3]
              ).toFixed(2)
            )
          );
          console.log(
            chalk.bold.red(
              moment(trades[trades.length - 1][1]).format("HH:mm:ss") +
                " Exchange: Bitfinex | Type: Sell | BTC-USD: $" +
                trades[trades.length - 1][3].toFixed(2) +
                " | Quantity: " +
                (trades[trades.length - 1][2] * -1).toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        }
      }
    }
  );

  ws.open();
};

monitor_bitmex = () => {
  const BitMEXClient = require("bitmex-realtime-api");
  const bitmexClient = new BitMEXClient({
    testnet: false,
  });
  bitmexClient.on("error", console.error);
  bitmexClient.on("open", () => console.log(""));
  bitmexClient.on("close", () => console.log(""));
  bitmexClient.on("initialize", () => console.log(""));
  bitmexClient.addStream("XBTUSD", "trade", async function (
    data,
    symbol,
    tableName
  ) {
    if (
      data[data.length - 1] != null &&
      data[data.length - 1] != undefined &&
      data != null &&
      data != undefined &&
      data[data.length - 1].size != undefined &&
      data[data.length - 1].size != null
    ) {
      bitcoinPricesMin.push(Number(data[data.length - 1].price));
      if (data[data.length - 1].size / data[data.length - 1].price >= size) {
        bitcoinTxCount += 1;
        const val = await numberWithCommas(
          Number(Math.abs(data[data.length - 1].size).toFixed())
        );
        if (data[data.length - 1].side == "Buy") {
          tradesIn += Math.abs(Number(data[data.length - 1].size.toFixed(2)));
          console.log(
            chalk.bold.green(
              moment(
                data[data.length - 1].timestamp.slice(
                  data[data.length - 1].timestamp.indexOf("T") + 1,
                  data[data.length - 1].timestamp.indexOf(".")
                ),
                "HH:mm:ss"
              )
                .subtract(
                  moment.duration({
                    hours: 5,
                  })
                )
                .format("HH:mm:ss") +
                " Exchange: Bitmex   | Type: Buy  | BTC-USD: $" +
                data[data.length - 1].price.toFixed(2) +
                " | Quantity: " +
                (
                  data[data.length - 1].size / data[data.length - 1].price
                ).toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        } else if (data[data.length - 1].side == "Sell") {
          tradesOut += Math.abs(Number(data[data.length - 1].size.toFixed(2)));
          console.log(
            chalk.bold.red(
              moment(
                data[data.length - 1].timestamp.slice(
                  data[data.length - 1].timestamp.indexOf("T") + 1,
                  data[data.length - 1].timestamp.indexOf(".")
                ),
                "HH:mm:ss"
              )
                .subtract(
                  moment.duration({
                    hours: 5,
                  })
                )
                .format("HH:mm:ss") +
                " Exchange: Bitmex   | Type: Sell | BTC-USD: $" +
                data[data.length - 1].price.toFixed(2) +
                " | Quantity: " +
                (
                  data[data.length - 1].size / data[data.length - 1].price
                ).toFixed(3) +
                " BTC" +
                " | Value: $" +
                val
            )
          );
        }
      }
    }
  });
};

monitor_binance = () => {
  default_pair = "BTCUSDT";
  client
    .trades({
      symbol: default_pair,
    })
    .then(async (trades) => {
      for (let x = 0; x < trades.length; x++) {
        let alreadyAdded = false;
        let lastPrice;
        if (x == 0) {
          lastPrice = trades[0].price;
        } else {
          lastPrice = trades[x - 1].price;
        }
        for (let y = 0; y < recentTrades.length; y++) {
          if (recentTrades[y].time == trades[x].time) {
            alreadyAdded = true;
          }
        }
        if (!alreadyAdded) {
          bitcoinPricesMin.push(Number(trades[x].price));
          const val = await numberWithCommas(
            Number(Math.abs(Number(trades[x].price * trades[x].qty)).toFixed())
          );
          if (trades[x].qty >= size) {
            bitcoinTxCount += 1;
            if (!trades[x].isBuyerMaker && trades[x].price > lastPrice) {
              tradesIn += Math.abs(
                Number(Number(trades[x].price * trades[x].qty).toFixed(2))
              );
              console.log(
                chalk.bold.green(
                  moment(trades[x].time).format("HH:mm:ss") +
                    " Exchange: Binance  | Type: Buy  | BTC-USD: $" +
                    Number(trades[x].price).toFixed(2) +
                    " | Quantity: " +
                    Number(trades[x].qty).toFixed(3) +
                    " BTC" +
                    " | Value: $" +
                    val
                )
              );
            } else {
              tradesOut += Math.abs(
                Number(Number(trades[x].price * trades[x].qty).toFixed(2))
              );
              console.log(
                chalk.bold.red(
                  moment(trades[x].time).format("HH:mm:ss") +
                    " Exchange: Binance  | Type: Sell | BTC-USD: $" +
                    Number(trades[x].price).toFixed(2) +
                    " | Quantity: " +
                    Number(trades[x].qty).toFixed(3) +
                    " BTC" +
                    " | Value: $" +
                    val
                )
              );
            }
          }
          recentTrades.push(trades[x]);
        }
      }
      monitor_binance();
    })
    .catch((error) => {
      console.log(error);
    });
};

calculateBitcoinAvg = () => {
  let sum = 0;
  if (bitcoinPricesMin.length != 0) {
    for (let x = 0; x < bitcoinPricesMin.length; x++) {
      sum += bitcoinPricesMin[x];
    }
    bitcoinAvg = sum / bitcoinPricesMin.length;
  } else {
    bitcoinAvg = 0;
  }
  return bitcoinAvg;
};

const run = async () => {
  ask_initial_request();
};

run();
