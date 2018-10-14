const chalk = require("chalk");
const ora = require("ora");
const moment = require("moment");
const _ = require("lodash");
const numeral = require("numeral");
const clear = require("clear");
const figlet = require("figlet");
const Configstore = require("configstore");
const inquirer = require("inquirer");
const puretext = require('puretext');
require('request');
//exchanges
const binance = require("binance-api-node").default;
const binance2 = require('node-binance-api')().options({
  APIKEY: 'xxx',
  APISECRET: 'xxx',
  useServerTime: true,
  test: true // True = SandboxMode
});
const Gdax = require("gdax");
const websocket = new Gdax.WebsocketClient(["BTC-USD"]);
const BFX = require("bitfinex-api-node");
const bfx = new BFX({
  apiKey: "...",
  apiSecret: "...",
  ws: {
    autoReconnect: true,
    seqAudit: true,
    packetWDDelay: 10 * 1000
  }
});
var OKEX = require("okex-rest");
var okexClient = new OKEX();

const APIKEY = "xxx";
const APISECRET = "xxx";
let listClose = [];
let changeUp = 0;
let changeDown = 0;
let last_closeHigh = 0;
let last_closeLow = 0;
let current_time = Date.now();
let period = 20;
let tracking = false;
let trading = false;
let pnl = 0;
let step = 0;
let order_id = 0;
let buy_price = 0.0;
let switch_price = 0.0;
let stop_price = 0.0;
let loss_price = 0.0;
let sell_price = 0.0;
let minute_price = 0.0;
let minute_prices = [];
let minute_volume = 0.0;
let curr_min_delta = 0.0;
let last_min_delta = 0.0;
let prev_min_delta = 0.0;
let half_hour_delta = 0.0;
let one_hour_delta = 0.0;
let two_hour_delta = 0.0;
let last_price = 0.0;
let price_direction = 0;
let precision = 8;
let tot_cancel = 0;
let recentTrades = [];
let bitcoinPricesMin = [];
let bitcoinAvg = 0;
let bitcoinTxCount = 0;
let size = 0.1;
const client = binance({
  apiKey: APIKEY,
  apiSecret: APISECRET
});

const conf = new Configstore("nbt");
let default_pair = conf.get("nbt.default_pair") ?
  conf.get("nbt.default_pair") :
  "BTCUSDT";
let buy_amount = conf.get("nbt.buy_amount") ? conf.get("nbt.buy_amount") : 1.0;
let profit_pourcent = conf.get("nbt.profit_pourcent") ?
  conf.get("nbt.profit_pourcent") :
  0.8;
let loss_pourcent = conf.get("nbt.loss_pourcent") ?
  conf.get("nbt.loss_pourcent") :
  0.4;

clear();

var viewRequest = [{
  type: "list",
  name: "menu",
  default: 0,
  message: chalk.cyan("What to do?"),
  choices: ["View Pair", "Monitor BTC", "Technicals", "Quit Bot"]
}];

var default_pair_input = [{
  type: "input",
  name: "pair",
  message: chalk.cyan("Enter Cryptocurrency Pair"),
  default: default_pair
}];

var monitor_input = [{
  type: "input",
  name: "size",
  message: chalk.cyan("Enter BTC Size Trigger"),
  default: 0,
  validate: function (value) {
    var valid = !isNaN(parseFloat(value)) && value >= 0;
    return valid || "Please enter a number >= 0";
  }
}];

ask_initial_request = () => {
  console.log(" ");
  inquirer.prompt(viewRequest).then(answer => {
    if (answer.menu === "View Pair") {
      ask_default_pair();
    } else if (answer.menu === "Monitor BTC") {
      inquirer.prompt(monitor_input).then(answers => {
        size = answers.size;
        monitor_gdax();
        monitor_bitmex();
        monitor_bfx();
        monitor_binance();
        setInterval(function () {
          calculateBitcoinAvg();
          console.log(chalk.black.bgCyan("1 min Bitcoin Avg: $" + Number(bitcoinAvg).toFixed(2) + " | # of trades: " + bitcoinTxCount));
          //send text if transactions count (1m) > #
          if (bitcoinTxCount >= 100) {
            let text = {
              // To Number is the number you will be sending the text to.
              toNumber: '+X-XXX-XXX-XXXX',
              // From number is the number you will buy from your admin dashboard (https://www.puretext.us/dashboard/#/numbers)
              fromNumber: '+XXXXXXXXXXX',
              // Text Content
              smsBody: bitcoinTxCount + " TXS | $" + Number(bitcoinAvg).toFixed(2),
              //Sign up for an account to get an API Token (https://www.puretext.us/auth/google)
              apiToken: 'XXXXX'
            };

            puretext.send(text, function (err, response) {})
          }
          bitcoinPricesMin = [];
          bitcoinTxCount = 0;
        }, 60000);
      });
    } else if (answer.menu === "Technicals") {
      calculateRSI();
    } else if (answer.menu === "Quit Bot") {
      process.exit();
    }
  });
};

ask_default_pair = () => {
  console.log(" ");
  inquirer.prompt(default_pair_input).then(answers => {
    default_pair = answers.pair.toUpperCase();
    const report = ora("Fetching 1 min candles...").start();

    client
      .candles({
        symbol: default_pair,
        interval: "1m"
      })
      .then(candles => {
        conf.set("nbt.default_pair", default_pair);
        default_pair_input[0].default = default_pair;

        candles.forEach(candle => {
          minute_prices.unshift(parseFloat(candle.close));
        });

        minute_price = parseFloat(candles[candles.length - 1].close);
        minute_volume = parseFloat(candles[candles.length - 1].volume);
        curr_min_delta =
          (100.0 *
            (candles[candles.length - 1].close -
              candles[candles.length - 1].open)) /
          candles[candles.length - 1].open;
        last_min_delta =
          (100.0 *
            (candles[candles.length - 2].close -
              candles[candles.length - 2].open)) /
          candles[candles.length - 2].open;
        prev_min_delta =
          (100.0 *
            (candles[candles.length - 3].close -
              candles[candles.length - 3].open)) /
          candles[candles.length - 3].open;
        half_hour_delta =
          (100.0 *
            (candles[candles.length - 1].close -
              candles[candles.length - 30].close)) /
          candles[candles.length - 30].open;
        one_hour_delta =
          (100.0 *
            (candles[candles.length - 1].close -
              candles[candles.length - 60].close)) /
          candles[candles.length - 60].open;
        two_hour_delta =
          (100.0 *
            (candles[candles.length - 1].close -
              candles[candles.length - 120].close)) /
          candles[candles.length - 120].open;
        price_direction =
          parseFloat(candles[candles.length - 1].close) > last_price ?
          1 :
          parseFloat(candles[candles.length - 1].close) < last_price ?
          -1 :
          0;
        last_price = parseFloat(candles[candles.length - 1].close);

        report.text = candle_report();
        const clean_candles = client.ws.candles(default_pair, "1m", candle => {
          if (candle.isFinal) {
            minute_prices.unshift(parseFloat(candle.close));
          }

          minute_volume = parseFloat(candle.volume);
          minute_price = parseFloat(candle.close);
          curr_min_delta = (100.0 * (candle.close - candle.open)) / candle.open;
          last_min_delta =
            (100.0 * (minute_prices[0] - minute_prices[1])) / minute_prices[1];
          prev_min_delta =
            (100.0 * (minute_prices[1] - minute_prices[2])) / minute_prices[2];
          half_hour_delta =
            (100.0 * (minute_prices[0] - minute_prices[30])) /
            minute_prices[30];
          one_hour_delta =
            (100.0 * (minute_prices[0] - minute_prices[60])) /
            minute_prices[60];
          two_hour_delta =
            (100.0 * (minute_prices[0] - minute_prices[120])) /
            minute_prices[120];
          price_direction =
            parseFloat(candle.close) > last_price ?
            1 :
            parseFloat(candle.close) < last_price ?
            -1 :
            0;
          last_price = parseFloat(candle.close);

          report.text = candle_report();

          if (minute_prices.length > 130) minute_prices.pop();
        });

        if (!tracking) {
          tracking = true;
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once("data", () => {
            report.succeed();
            if (tracking) {
              tracking = false;
              clean_candles();
              minute_prices = [];
              console.log(" ");
              setTimeout(() => {
                ask_buy_or_change();
              }, 1000);
            }
          });
        }
      })
      .catch(error => {
        report.fail(chalk.yellow("--> Invalid Pair"));
        console.error("ERROR 6 " + error);
        ask_default_pair();
      });
  });
};

calculateRSI = () => {
  let intervals = ['5m', '4h', '1d', '1w', '1M'];
  intervals.forEach(timePeriod => {
    binance2.candlesticks("BTCUSDT", timePeriod, (error, ticks, symbol) => {
      for (i = 0; i < ticks.length; i++) {
        let last_tick = ticks[i];
        let [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = last_tick;
        listClose.push(close);
        if (i == ticks.length - 1) {
          for (x = 0; x < ticks.length; x++) {
            previous_close = (parseFloat(listClose[x - 1]));
            current_close = (parseFloat(listClose[x]));
            // HIGH
            if (current_close > previous_close) {
              upChange = current_close - previous_close;
              changeUp += upChange;
              if (x == ticks.length - 1) {
                last_closeHigh = current_close - previous_close;
              }
            }
            // LOW
            if (previous_close > current_close) {
              downChange = previous_close - current_close;
              changeDown += downChange;
              if (x == ticks.length - 1) {
                last_closeLow = previous_close - current_close;
              }
            }
            if (x == ticks.length - 1) {
              AVGHigh = changeUp / period;
              AVGLow = changeDown / period;
              Upavg = (AVGHigh * (period - 1) + last_closeHigh) / (period);
              Downavg = (AVGLow * (period - 1) + last_closeLow) / (period);
              RS = Upavg / Downavg;
              RSI = (100 - (100 / (1 + RS)));
              if (RSI >= 70) {
                console.log("BTC/USDT (" + chalk.bold.cyan(timePeriod) + ") RSI: " + chalk.bold.red(RSI.toFixed(3)));
              } else if (RSI <= 30) {
                console.log("BTC/USDT (" + chalk.bold.cyan(timePeriod) + ") RSI: " + chalk.bold.green(RSI.toFixed(3)));
              } else {
                console.log("BTC/USDT (" + chalk.bold.cyan(timePeriod) + ") RSI: " + RSI.toFixed(3));
              }
            }
          }
        }
      }
    }, {
      limit: period,
      endTime: current_time
    });
  });

}

monitor_gdax = () => {
  websocket.on("message", data => {
    if (
      data.side != null &&
      data.size != null &&
      data.price != null &&
      data.type == "match"
    ) {
      bitcoinPricesMin.push(Number(data.price));
      if (Number(data.size) >= size) {
        bitcoinTxCount += 1;
        if (data.side == "buy") {
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
                  hours: 5
                })
              )
              .format("HH:mm:ss") +
              " Exchange: GDAX     | Type: Buy  | BTC-USD: $" +
              Number(data.price).toFixed(2) +
              " | Quantity: " +
              Number(data.size).toFixed(3) +
              " BTC" +
              " | Value: $" +
              (Number(data.price) * Number(data.size)).toFixed(2)
            )
          );
        } else {
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
                  hours: 5
                })
              )
              .format("HH:mm:ss") +
              " Exchange: GDAX     | Type: Sell | BTC-USD: $" +
              Number(data.price).toFixed(2) +
              " | Quantity: " +
              Number(data.size).toFixed(3) +
              " BTC" +
              " | Value: $" +
              (Number(data.price) * Number(data.size)).toFixed(2)
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

  ws.on("error", err => console.log(err));
  ws.on("open", () => {
    ws.subscribeTrades("BTCUSD");
  });

  ws.onTrades({
      pair: "BTCUSD"
    },
    trades => {
      bitcoinPricesMin.push(Number(trades[trades.length - 1][3]));
      if (Math.abs(trades[trades.length - 1][2]) >= size) {
        bitcoinTxCount += 1;
        if (trades[trades.length - 1][2] >= 0) {
          console.log(
            chalk.bold.green(
              moment(trades[trades.length - 1][1]).format("HH:mm:ss") +
              " Exchange: Bitfinex | Type: Buy  | BTC-USD: $" +
              trades[trades.length - 1][3].toFixed(2) +
              " | Quantity: " +
              trades[trades.length - 1][2].toFixed(3) +
              " BTC" +
              " | Value: $" +
              (
                trades[trades.length - 1][2] * trades[trades.length - 1][3]
              ).toFixed(2)
            )
          );
        } else {
          console.log(
            chalk.bold.red(
              moment(trades[trades.length - 1][1]).format("HH:mm:ss") +
              " Exchange: Bitfinex | Type: Sell | BTC-USD: $" +
              trades[trades.length - 1][3].toFixed(2) +
              " | Quantity: " +
              (trades[trades.length - 1][2] * -1).toFixed(3) +
              " BTC" +
              " | Value: $" +
              (
                trades[trades.length - 1][2] *
                trades[trades.length - 1][3] *
                -1
              ).toFixed(2)
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
    testnet: false
  });
  bitmexClient.on("error", console.error);
  bitmexClient.on("open", () => console.log(""));
  bitmexClient.on("close", () => console.log(""));
  bitmexClient.on("initialize", () => console.log(""));
  bitmexClient.addStream("XBTUSD", "trade", function (data, symbol, tableName) {
    if (data[data.length - 1] != null && data[data.length - 1] != undefined && data != null && data != undefined &&
      data[data.length - 1].size != undefined &&
      data[data.length - 1].size != null
    ) {
      bitcoinPricesMin.push(Number(data[data.length - 1].price))
      if (data[data.length - 1].size / data[data.length - 1].price >= size) {
        bitcoinTxCount += 1;
        if (data[data.length - 1].side == "Buy") {
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
                  hours: 5
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
              data[data.length - 1].size.toFixed(2)
            )
          );
        } else if (data[data.length - 1].side == "Sell") {
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
                  hours: 5
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
              data[data.length - 1].size.toFixed(2)
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
      symbol: default_pair
    })
    .then(trades => {
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
          bitcoinPricesMin.push(Number(trades[x].price))
          if (trades[x].qty >= size) {
            bitcoinTxCount += 1;
            if (!trades[x].isBuyerMaker && trades[x].price > lastPrice) {
              console.log(
                chalk.bold.green(
                  moment(trades[x].time).format("HH:mm:ss") +
                  " Exchange: Binance  | Type: Buy  | BTC-USD: $" +
                  Number(trades[x].price).toFixed(2) +
                  " | Quantity: " +
                  Number(trades[x].qty).toFixed(3) +
                  " BTC" +
                  " | Value: $" +
                  Number(trades[x].price * trades[x].qty).toFixed(2)
                )
              );
            } else {
              console.log(
                chalk.bold.red(
                  moment(trades[x].time).format("HH:mm:ss") +
                  " Exchange: Binance  | Type: Sell | BTC-USD: $" +
                  Number(trades[x].price).toFixed(2) +
                  " | Quantity: " +
                  Number(trades[x].qty).toFixed(3) +
                  " BTC" +
                  " | Value: $" +
                  Number(trades[x].price * trades[x].qty).toFixed(2)
                )
              );
            }
          }
          recentTrades.push(trades[x]);
        }
      }
      monitor_binance();
    })
    .catch(error => {
      report.fail(chalk.yellow("Error"));
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
}

candle_report = () => {
  return (
    chalk.grey(
      moment()
      .format("h:mm:ss")
      .padStart(9)
    ) +
    chalk.yellow(default_pair.padStart(11)) +
    (price_direction === 1 ?
      chalk.green(" + ") :
      price_direction === -1 ?
      chalk.red(" - ") :
      "   ") +
    chalk.cyan(minute_price).padEnd(20) +
    chalk.white("Volume: ") +
    chalk.white(String(minute_volume).padEnd(12)) +
    chalk.gray(" Current: ") +
    (curr_min_delta > 0 ?
      chalk.green((numeral(curr_min_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(curr_min_delta).format("0.000") + "%").padEnd(8))) +
    (curr_min_delta > 2 ?
      chalk.green("Short Squeeze".padEnd(8)) :
      curr_min_delta < -2 ?
      chalk.red("Long Squeeze".padEnd(8)) :
      "") +
    chalk.gray(" 1m: ") +
    (last_min_delta > 0 ?
      chalk.green((numeral(last_min_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(last_min_delta).format("0.000") + "%").padEnd(8))) +
    chalk.gray(" 2m: ") +
    (prev_min_delta > 0 ?
      chalk.green((numeral(prev_min_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(prev_min_delta).format("0.000") + "%").padEnd(8))) +
    chalk.gray(" 30m: ") +
    (half_hour_delta > 0 ?
      chalk.green((numeral(half_hour_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(half_hour_delta).format("0.000") + "%").padEnd(8))) +
    chalk.gray(" 1h: ") +
    (one_hour_delta > 0 ?
      chalk.green((numeral(one_hour_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(one_hour_delta).format("0.000") + "%").padEnd(8))) +
    chalk.gray(" 2h: ") +
    (two_hour_delta > 0 ?
      chalk.green((numeral(two_hour_delta).format("0.000") + "%").padEnd(8)) :
      chalk.red((numeral(two_hour_delta).format("0.000") + "%").padEnd(8)))
  );
};

var buy_or_change_request = [{
  type: "list",
  name: "menu",
  default: 2,
  message: chalk.cyan("What next"),
  choices: ["Change Pair", "Market Buy", "Monitor BTC", "Quit Bot"]
}];

ask_buy_or_change = () => {
  inquirer.prompt(buy_or_change_request).then(answer => {
    if (answer.menu === "Change Pair") {
      ask_default_pair();
    } else if (answer.menu === "Market Buy") {
      ask_buy_info();
    } else if (answer.menu === "Monitor BTC") {
      inquirer.prompt(monitor_input).then(answers => {
        size = answers.size;
        monitor_gdax();
        monitor_bitmex();
        monitor_bfx();
        monitor_binance();
        setInterval(function () {
          calculateBitcoinAvg();
          console.log(chalk.cyan("1m avg: " + bitcoinAvg));
          bitcoinPricesMin = [];
        }, 60000);
      });
    } else if (answer.menu === "Quit Bot") {
      process.exit();
    }
  });
};

var ask_buy_info_request = [{
    type: "input",
    name: "buy_amount",
    default: buy_amount,
    message: chalk.cyan("Enter the amount to buy:"),
    validate: function (value) {
      var valid = !isNaN(parseFloat(value)) && value > 0;
      return valid || "Please enter a number > 0";
    },
    filter: Number
  },
  {
    type: "input",
    name: "loss_pourcent",
    default: loss_pourcent,
    message: chalk.magenta("Enter the stop loss percentage:"),
    validate: function (value) {
      var valid = !isNaN(parseFloat(value)) && value > 0.1 && value < 100.0;
      return valid || "Please enter a number 0.10< x <99.99";
    },
    filter: Number
  },
  {
    type: "input",
    name: "profit_pourcent",
    default: profit_pourcent,
    message: chalk.green("Enter the profit percentage:"),
    validate: function (value) {
      var valid = !isNaN(parseFloat(value)) && value > 0.1 && value < 100.0;
      return valid || "Please enter a number between 0.10 and 99.99";
    },
    filter: Number
  },
  {
    type: "confirm",
    name: "confirm",
    message: chalk.cyan("Please confirm Buy Order at Market Price?"),
    default: true
  }
];

ask_buy_info = () => {
  inquirer.prompt(ask_buy_info_request).then(answers => {
    conf.set("nbt.buy_amount", answers.buy_amount);
    conf.set("nbt.profit_pourcent", answers.profit_pourcent);
    conf.set("nbt.loss_pourcent", answers.loss_pourcent);
    buy_amount = answers.buy_amount;
    profit_pourcent = answers.profit_pourcent;
    loss_pourcent = answers.loss_pourcent;
    ask_buy_info_request[0].default = buy_amount;
    ask_buy_info_request[2].default = profit_pourcent;
    ask_buy_info_request[1].default = loss_pourcent;
    if (answers.confirm) {
      const report = ora("Starting the trade...").start();

      // Find out the order quote precision
      client.exchangeInfo().then(results => {
        precision =
          _
          .filter(results.symbols, {
            symbol: default_pair
          })[0]
          .filters[0].tickSize.indexOf("1") - 1;
        report.text =
          chalk.grey(
            moment()
            .format("h:mm:ss")
            .padStart(9)
          ) +
          chalk.yellow(default_pair.padStart(11)) +
          chalk.white(
            " Quote precision for " + default_pair + " is " + precision
          );

        // Find out the last trade price:
        client
          .trades({
            symbol: default_pair,
            limit: 1
          })
          .then(last_trade => {
            buy_price = parseFloat(last_trade[0].price);
            report.text =
              chalk.grey(
                moment()
                .format("h:mm:ss")
                .padStart(9)
              ) +
              chalk.yellow(default_pair.padStart(11)) +
              chalk.white(
                " Last trade price was: " +
                buy_price +
                " Let's try to buy at this price."
              );

            // Try to buy at the last price:
            client
              .order({
                symbol: default_pair,
                side: "BUY",
                quantity: buy_amount,
                price: buy_price.toFixed(precision),
                recvWindow: 1000000
              })
              .then(order_result => {
                order_id = order_result.orderId;
                var log_report =
                  chalk.grey(
                    moment()
                    .format("h:mm:ss")
                    .padStart(9)
                  ) +
                  chalk.yellow(default_pair.padStart(11)) +
                  chalk.white(" INITIAL BUY ORDER SET AT " + buy_price);
                report.text = log_report;
                step = 1;

                const clean_trades = client.ws.trades([default_pair], trade => {
                  report.text = add_status_to_trade_report(trade, "");

                  // CHECK WHEN INITIAL BUY ORDER HAS BEEN EXECUTED
                  if (order_id && step === 1) {
                    step = 99;
                    var i = 1;
                    checkOrderStatus = () => {
                      setTimeout(() => {
                        client
                          .getOrder({
                            symbol: default_pair,
                            orderId: order_id,
                            recvWindow: 1000000
                          })
                          .then(order_result => {
                            if (
                              parseFloat(order_result.executedQty) <
                              parseFloat(order_result.origQty)
                            ) {
                              var log_report =
                                " AMOUNT NOT ALL EXECUTED -> " +
                                order_result.executedQty +
                                " / " +
                                order_result.origQty;
                              report.text = add_status_to_trade_report(
                                trade,
                                log_report
                              );
                              if (i > 10) {
                                client
                                  .cancelOrder({
                                    symbol: default_pair,
                                    orderId: order_result.orderId,
                                    recvWindow: 1000000
                                  })
                                  .then(order => {
                                    var log_report = " BUY ORDER CANCELED. ";
                                    report.text = add_status_to_trade_report(
                                      trade,
                                      log_report
                                    );

                                    log_report = " BUY ORDER AT MARKET PRICE ";
                                    report.text = add_status_to_trade_report(
                                      trade,
                                      log_report
                                    );

                                    // SETUP MARKET BUY ORDER
                                    client
                                      .order({
                                        symbol: default_pair,
                                        side: "BUY",
                                        type: "MARKET",
                                        quantity: parseFloat(order_result.origQty) -
                                          parseFloat(order_result.executedQty),
                                        recvWindow: 1000000
                                      })
                                      .then(order => {
                                        order_id = order.orderId;
                                        var log_report =
                                          " BUY MARKET ORDER SET ";
                                        report.text = add_status_to_trade_report(
                                          trade,
                                          log_report
                                        );
                                        step = 2;
                                      })
                                      .catch(error => {
                                        //step = 1
                                        // need to fix: Order BUY MARKET Error... Error: Filter failure: LOT_SIZE
                                        // for bigger orders full amount not fully bought
                                        console.error(
                                          "Order BUY MARKET Error... " + error
                                        );
                                      });
                                  })
                                  .catch(error => {
                                    step = 1;
                                    console.error(
                                      "Order Cancelling Error... " + error
                                    );
                                  });
                              } else {
                                i++;
                                checkOrderStatus();
                              }
                            } else {
                              var log_report =
                                " ALL AMOUNT EXECUTED -> " +
                                order_result.executedQty +
                                " / " +
                                order_result.origQty;
                              report.text = add_status_to_trade_report(
                                trade,
                                log_report
                              );
                              step = 2;
                            }
                          })
                          .catch(error => {
                            console.error("ERROR 12 " + error);
                          });
                      }, 1000);
                    };
                    checkOrderStatus();
                  }

                  // SETTING INITIAL STOP LOSS (1)
                  if (order_id && step === 2) {
                    step = 99;
                    // FIND OUT OUR BUY PRICE
                    client
                      .myTrades({
                        symbol: default_pair,
                        recvWindow: 1000000,
                        limit: 1
                      })
                      .then(mytrade => {
                        buy_price = parseFloat(mytrade[0].price);
                        switch_price = (
                          buy_price +
                          buy_price * 0.005 * profit_pourcent
                        ).toFixed(precision);
                        stop_price = (
                          buy_price -
                          buy_price * 0.01 * loss_pourcent
                        ).toFixed(precision);
                        loss_price = (stop_price - stop_price * 0.04).toFixed(
                          precision
                        );
                        sell_price = (
                          buy_price +
                          buy_price * 0.01 * profit_pourcent
                        ).toFixed(precision);
                        var log_report = " SETTING UP STOP LOSS NOW (1) ";
                        report.text = add_status_to_trade_report(
                          trade,
                          log_report
                        );
                        client
                          .order({
                            symbol: default_pair,
                            side: "SELL",
                            type: "STOP_LOSS_LIMIT",
                            stopPrice: stop_price,
                            quantity: buy_amount,
                            price: loss_price,
                            recvWindow: 1000000
                          })
                          .then(order => {
                            order_id = order.orderId;
                            var log_report = " STOP LOSS READY (1) ";
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                            step = 3;
                          })
                          .catch(error => {
                            console.error(error);
                            // Error: Order would trigger immediately
                            // Sell the bag at market price
                            var log_report = " SELLING AT MARKET PRICE ";
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                            client
                              .order({
                                symbol: default_pair,
                                side: "SELL",
                                type: "MARKET",
                                quantity: buy_amount,
                                recvWindow: 1000000
                              })
                              .then(order => {
                                step = 0;
                                var log_report = chalk.magenta(
                                  " PRICE BELLOW LOSS PRICE THE BOT SOLD AT MARKET PRICE #789"
                                );
                                report.text = add_status_to_trade_report(
                                  trade,
                                  log_report
                                );
                                order_id = 0;
                                buy_price = 0.0;
                                stop_price = 0.0;
                                loss_price = 0.0;
                                sell_price = 0.0;
                                tot_cancel = 0;
                                report.succeed();
                                clean_trades();
                                ask_buy_or_change();
                              })
                              .catch(error => {
                                console.error("ERROR #651" + error);
                                //var log_report = chalk.magenta(" STOP LOSS PRICE REACHED THE BOT TRIED TO SELL EVERYTHING AT MARKET PRICE BUT NO ERROR OCCURED #651 ")
                                //report.text = add_status_to_trade_report(trade, log_report)
                                //step = 2
                              });
                          });
                      });
                  }

                  // SWITCH PRICE REACHED SETTING UP SELL FOR PROFIT ORDER
                  if (order_id && step === 3 && trade.price > switch_price) {
                    step = 99;
                    var log_report = " CANCEL STOP LOSS AND GO FOR PROFIT ";
                    report.text = add_status_to_trade_report(trade, log_report);
                    tot_cancel = tot_cancel + 1;
                    client
                      .cancelOrder({
                        symbol: default_pair,
                        orderId: order_id,
                        recvWindow: 1000000
                      })
                      .then(() => {
                        client
                          .order({
                            symbol: default_pair,
                            side: "SELL",
                            quantity: buy_amount,
                            price: sell_price,
                            recvWindow: 1000000
                          })
                          .then(order => {
                            step = 5;
                            order_id = order.orderId;
                            var log_report = " SELL ORDER READY ";
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                          })
                          .catch(error => {
                            var log_report = chalk.magenta(
                              " WE LOST THIS ONE 5 "
                            );
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                            //console.error(error)
                            client
                              .getOrder({
                                symbol: default_pair,
                                orderId: order_id,
                                recvWindow: 1000000
                              })
                              .then(order_result => {
                                //console.log(JSON.stringify(order_result))
                                order_id = 0;
                                buy_price = 0.0;
                                stop_price = 0.0;
                                loss_price = 0.0;
                                sell_price = 0.0;
                                tot_cancel = 0;
                                report.succeed();
                                clean_trades();
                                ask_buy_or_change();
                              })
                              .catch(error => {
                                console.error("ERROR 10 " + error);
                              });
                          });
                      })
                      .catch(error => {
                        //console.log("  --- error 2 ---")
                        //console.error(error)
                        var log_report = chalk.magenta(
                          " STOP LOSS EXECUTED #456 "
                        );
                        report.text = add_status_to_trade_report(
                          trade,
                          log_report
                        );
                        client
                          .getOrder({
                            symbol: default_pair,
                            orderId: order_id,
                            recvWindow: 1000000
                          })
                          .then(order_result => {
                            //console.log(JSON.stringify(order_result))
                            order_id = 0;
                            buy_price = 0.0;
                            stop_price = 0.0;
                            loss_price = 0.0;
                            sell_price = 0.0;
                            tot_cancel = 0;
                            report.succeed();
                            clean_trades();
                            ask_buy_or_change();
                          })
                          .catch(error => {
                            console.error("ERROR 11 " + error);
                          });
                      });
                  }

                  // PRICE BELLOW BUY PRICE SETTING UP STOP LOSS ORDER
                  if (order_id && step === 5 && trade.price < buy_price) {
                    step = 99;
                    var log_report =
                      " CANCEL PROFIT AND SETTING UP STOP LOSS NOW (2) !!! ";
                    report.text = add_status_to_trade_report(trade, log_report);
                    tot_cancel = tot_cancel + 1;
                    client
                      .cancelOrder({
                        symbol: default_pair,
                        orderId: order_id,
                        recvWindow: 1000000
                      })
                      .then(() => {
                        client
                          .order({
                            symbol: default_pair,
                            side: "SELL",
                            type: "STOP_LOSS_LIMIT",
                            stopPrice: stop_price,
                            quantity: buy_amount,
                            price: loss_price,
                            recvWindow: 1000000
                          })
                          .then(order => {
                            order_id = order.orderId;
                            var log_report = " STOP LOSS READY (2) ";
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                            step = 3;
                          })
                          .catch(error => {
                            //console.error(error)
                            // Error: Order would trigger immediately
                            // Sell the bag at market price
                            var log_report = " SELLING AT MARKET PRICE (2)";
                            report.text = add_status_to_trade_report(
                              trade,
                              log_report
                            );
                            client
                              .order({
                                symbol: default_pair,
                                side: "SELL",
                                type: "MARKET",
                                quantity: buy_amount,
                                recvWindow: 1000000
                              })
                              .then(order => {
                                step = 0;
                                var log_report = chalk.magenta(
                                  " LOSS PRICE REACHED THE BOT SOLD AT MARKET PRICE #111"
                                );
                                report.text = add_status_to_trade_report(
                                  trade,
                                  log_report
                                );
                                order_id = 0;
                                buy_price = 0.0;
                                stop_price = 0.0;
                                loss_price = 0.0;
                                sell_price = 0.0;
                                tot_cancel = 0;
                                report.succeed();
                                clean_trades();
                                ask_buy_or_change();
                              })
                              .catch(error => {
                                step = 0;
                                pnl =
                                  (100.0 * (buy_price - trade.price)) /
                                  buy_price;
                                var log_report = chalk.magenta(
                                  " LOSS PRICE REACHED THE BOT TRIED TO SELL EVERYTHING AT MARKET PRICE #333 "
                                );
                                report.text = add_status_to_trade_report(
                                  trade,
                                  log_report
                                );
                                order_id = 0;
                                buy_price = 0.0;
                                stop_price = 0.0;
                                loss_price = 0.0;
                                sell_price = 0.0;
                                tot_cancel = 0;
                                report.succeed();
                                clean_trades();
                                ask_buy_or_change();
                              });
                          });
                      })
                      .catch(error => {
                        // need to fix: ERROR 4 Error: UNKNOWN_ORDER
                        //console.error("ERROR 4 " + error)
                        //step = 5
                        step = 0;
                        pnl = (100.0 * (buy_price - trade.price)) / buy_price;
                        var log_report = chalk.magenta(
                          " LOSS PRICE REACHED THE BOT SOLD EVERYTHING #454 "
                        );
                        report.text = add_status_to_trade_report(
                          trade,
                          log_report
                        );
                        order_id = 0;
                        buy_price = 0.0;
                        stop_price = 0.0;
                        loss_price = 0.0;
                        sell_price = 0.0;
                        tot_cancel = 0;
                        report.fail();
                        clean_trades();
                        ask_buy_or_change();
                      });
                  }

                  // CURRENT PRICE REACHED SELL PRICE
                  if (order_id && step === 5 && trade.price >= sell_price) {
                    step = 99;
                    client
                      .getOrder({
                        symbol: default_pair,
                        orderId: order_id,
                        recvWindow: 1000000
                      })
                      .then(order_result => {
                        if (
                          parseFloat(order_result.executedQty) <
                          parseFloat(order_result.origQty)
                        ) {
                          var log_report =
                            " PROFIT PRICE REACHED BUT NOT ALL EXECUTED -> " +
                            order_result.executedQty +
                            " / " +
                            order_result.origQty;
                          report.text = add_status_to_trade_report(
                            trade,
                            log_report
                          );
                          step = 5;
                        } else {
                          step = 0;
                          pnl = (100.0 * (trade.price - buy_price)) / buy_price;
                          var log_report = chalk.greenBright(
                            " ðŸ¬ !!! WE HAVE A WINNER !!! ðŸ¬ THE BOT SOLD EVERYTHING AT PROFIT"
                          );
                          report.text = add_status_to_trade_report(
                            trade,
                            log_report
                          );
                          order_id = 0;
                          buy_price = 0.0;
                          stop_price = 0.0;
                          loss_price = 0.0;
                          sell_price = 0.0;
                          tot_cancel = 0;
                          report.succeed();
                          clean_trades();
                          ask_buy_or_change();
                        }
                      })
                      .catch(error => {
                        console.error("ERROR 8 " + error);
                      });
                  }

                  // CURRENT PRICE REACHED STOP PRICE
                  if (order_id && step === 3 && trade.price <= stop_price) {
                    step = 99;
                    client
                      .getOrder({
                        symbol: default_pair,
                        orderId: order_id,
                        recvWindow: 1000000
                      })
                      .then(order_result => {
                        if (
                          parseFloat(order_result.executedQty) <
                          parseFloat(order_result.origQty)
                        ) {
                          var log_report =
                            " STOP PRICE REACHED BUT NOT ALL EXECUTED -> " +
                            order_result.executedQty +
                            " / " +
                            order_result.origQty;
                          report.text = add_status_to_trade_report(
                            trade,
                            log_report
                          );
                          step = 5;
                        } else {
                          step = 0;
                          pnl = (100.0 * (buy_price - trade.price)) / buy_price;
                          var log_report = chalk.magenta(
                            " LOSS PRICE REACHED THE BOT SOLD EVERYTHING SUCCESSFULLY #746"
                          );
                          report.text = add_status_to_trade_report(
                            trade,
                            log_report
                          );
                          order_id = 0;
                          buy_price = 0.0;
                          stop_price = 0.0;
                          loss_price = 0.0;
                          sell_price = 0.0;
                          tot_cancel = 0;
                          report.succeed();
                          clean_trades();
                          ask_buy_or_change();
                        }
                      })
                      .catch(error => {
                        console.error("ERROR 9 " + error);
                      });
                  }
                });
              })
              .catch(error => {
                //console.error(error)
                // report.fail(chalk.yellow("There was an issue processing the Buy Order. Verify the minimum amount was reached and you have the amount on your account."))
                report.text(chalk.yellow("Buy order executed"));
                ask_buy_info();
              });
          });
      });
    } else {
      ask_buy_or_change();
    }
  });
};

add_status_to_trade_report = (trade, status) => {
  var pnl = (100.0 * (parseFloat(trade.price) - buy_price)) / buy_price;
  return (
    chalk.grey(
      moment()
      .format("h:mm:ss")
      .padStart(9)
    ) +
    chalk.yellow(trade.symbol.padStart(11)) +
    (!trade.maker ?
      chalk.green(
        (
          chalk.grey("qty:") + numeral(trade.quantity).format("0.000")
        ).padStart(24)
      ) :
      chalk.red(
        (
          chalk.grey("qty:") + numeral(trade.quantity).format("0.000")
        ).padStart(24)
      )) +
    chalk.grey(" @ ") +
    chalk.cyan(trade.price).padEnd(24) +
    (pnl >= 0 ?
      chalk.green(
        (chalk.grey("pnl:") + numeral(pnl).format("0.000")).padStart(16)
      ) :
      chalk.red(
        (chalk.grey("pnl:") + numeral(pnl).format("0.000")).padStart(16)
      )) +
    chalk.white(status)
  );
};

const run = async () => {
  ask_initial_request();
};

run();