const path = require("path");
const { pathToFileURL } = require("url");

const appPath = path.resolve(__dirname, "..", "..", "index.html");
const appUrl = `${pathToFileURL(appPath).href}?test=1`;

async function loadApp(page) {
  await page.goto(appUrl);
  await page.waitForFunction(() => Boolean(window.__PFD_TEST_API__));
}

async function callApi(page, method, ...args) {
  return page.evaluate(({ method, args }) => {
    const api = window.__PFD_TEST_API__;
    const parts = method.split(".");
    const fnName = parts.pop();
    const target = parts.reduce((value, part) => value[part], api);
    return target[fnName](...args);
  }, { method, args });
}

async function withApi(page, callback, arg = undefined) {
  return page.evaluate(({ source, arg }) => {
    const fn = new Function("api", "arg", `return (${source})(api, arg);`);
    return fn(window.__PFD_TEST_API__, arg);
  }, { source: callback.toString(), arg });
}

module.exports = {
  appUrl,
  loadApp,
  callApi,
  withApi
};
