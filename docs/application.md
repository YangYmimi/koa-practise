### application.js

这个是 `Koa` 的入口文件。

- 利用 `http` 模块启动服务

- 利用 `req` 和 `res` 去封装更强大的 `context`

- 利用 `koa-compose` 实现 `洋葱模型` 中间件执行机制

- 实现异步函数的错误处理

```javascript
"use strict";

/**
 * Module dependencies.
 */
// 判断是否是 generator 函数
const isGeneratorFunction = require("is-generator-function");
const debug = require("debug")("koa:application");
const onFinished = require("on-finished");
const response = require("./response");

// 组合中间件，利用 promise，将中间件按照 app.use() 顺序执行，无论中间件是同步还是异步，都利用 promise 转成链式执行
// refs: https://github.com/koajs/compose/blob/master/index.js
const compose = require("koa-compose");
const context = require("./context");
const request = require("./request");
const statuses = require("statuses");
const Emitter = require("events"); // node的Events模块，拥有事件处理的能力
const util = require("util");
const Stream = require("stream");
const http = require("http");
const only = require("only");

// 兼容 koa1 的 generator 写法
// https://github.com/koajs/convert/blob/master/index.js
const convert = require("koa-convert");
const deprecate = require("depd")("koa");
const { HttpError } = require("http-errors");

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  /**
   *
   * @param {object} [options] Application options
   * @param {string} [options.env='development'] Environment
   * @param {string[]} [options.keys] Signed cookie keys
   * @param {boolean} [options.proxy] Trust proxy headers
   * @param {number} [options.subdomainOffset] Subdomain offset
   * @param {boolean} [options.proxyIpHeader] proxy ip header, default to X-Forwarded-For
   * @param {boolean} [options.maxIpsCount] max ips read from proxy ip header, default to 0 (means infinity)
   *
   */
  // new Koa({options})
  constructor(options) {
    super();
    options = options || {};
    this.proxy = options.proxy || false;
    this.subdomainOffset = options.subdomainOffset || 2;
    // 代理 IP 消息头
    this.proxyIpHeader = options.proxyIpHeader || "X-Forwarded-For";
    // 从代理 ip 消息头读取的最大 ips
    this.maxIpsCount = options.maxIpsCount || 0;
    // 默认是 NODE_ENV 或者是 development
    this.env = options.env || process.env.NODE_ENV || "development";
    if (options.keys) this.keys = options.keys; // 设置签名的 Cookie 密钥
    // 存放所有中间件，这边是核心
    this.middleware = [];

    // 通过context.js、request.js、response.js创建对应的context、request、response
    this.context = Object.create(context);
    this.request = Object.create(request);
    this.response = Object.create(response);
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect;
    }
  }

  /**
   * Shorthand for:
   *
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */
  // 我们使用 var app = new Koa() 之后
  // app.listen() 其实就是 http.createServer(app.callback()).listen(...) 的语法糖
  listen(...args) {
    debug("listen");

    // 利用 http.createServer 初始化服务器，参数是 function
    // this 就是 Koa 实例
    // this.callback() 本身是回调函数，创建 server 成功之后，服务器回调 (req, res) => {}
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, ["subdomainOffset", "proxy", "env"]);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */
  // 将给定的中间件函数添加到中间件数组中
  use(fn) {
    if (typeof fn !== "function")
      throw new TypeError("middleware must be a function!");
    if (isGeneratorFunction(fn)) {
      // 兼容 generator 写法
      deprecate(
        "Support for generators will be removed in v3. " +
          "See the documentation for examples of how to convert old middleware " +
          "https://github.com/koajs/koa/blob/master/docs/migration.md"
      );
      fn = convert(fn);
    }
    debug("use %s", fn._name || fn.name || "-");
    // middleware 存放所有中间件
    this.middleware.push(fn);
    return this;
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   *
   * @return {Function}
   * @api public
   */
  // 返回一个 (req, res) => {} 的函数
  // http.createServer
  callback() {
    // middleware 必须是个 array 类型
    // middleware 每项必须是个 func 类型
    const fn = compose(this.middleware);

    // 由于继承 EventEmitter 模块，所以可以监听 error 事件
    // listenerCount 返回当前监听事件的数量
    if (!this.listenerCount("error")) this.on("error", this.onerror);

    const handleRequest = (req, res) => {
      // 创建 koa 中的 context
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn); // context 和 中间件 promise
    };

    // 返回 (req, res) 的回调函数
    return handleRequest;
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */

  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404;
    const onerror = err => ctx.onerror(err);
    const handleResponse = () => respond(ctx);
    onFinished(res, onerror);
    return fnMiddleware(ctx)
      .then(handleResponse)
      .catch(onerror);
  }

  /**
   * Initialize a new context.
   *
   * @api private
   */
  // 这是利用 req，res 去封装更强大的 ctx 对象
  createContext(req, res) {
    const context = Object.create(this.context);
    // context.request => koa 的 Request 对象
    // ctx.response => koa 的 Response 对象.

    // context 会挂载基于 request.js 和 response.js 实现的 request 和 response 对象
    const request = (context.request = Object.create(this.request));
    const response = (context.response = Object.create(this.response));

    // 挂载应用程序实例引用
    context.app = request.app = response.app = this; // 应用程序的实例引用

    // 将 node 原生的 res 对象作为 request 对象 (request.js封装的对象) 的属性
    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;
    request.ctx = response.ctx = context;
    request.response = response;
    response.request = request;
    context.originalUrl = request.originalUrl = req.url;

    // 推荐的命名空间，用于通过中间件传递信息和前端视图
    context.state = {};
    return context;
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */
  // 错误处理
  onerror(err) {
    if (!(err instanceof Error))
      throw new TypeError(util.format("non-error thrown: %j", err));

    if (404 == err.status || err.expose) return; // status = 404 或者 error.expose = true 时候也不输出错误
    if (this.silent) return; // 默认情况下，输出错误信息，当 app.silent = true 时候处于静默状态，不输出错误信息

    const msg = err.stack || err.toString();
    console.error();
    console.error(msg.replace(/^/gm, "  "));
    console.error();
  }
};

/**
 * Response helper.
 */

function respond(ctx) {
  // allow bypassing koa
  // 设置 false 绕过 Koa 内置的 response 处理，这样会使用原始的 fn(req, res) 功能
  if (false === ctx.respond) return;

  if (!ctx.writable) return;

  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null;
    return res.end();
  }

  if ("HEAD" === ctx.method) {
    if (!res.headersSent && !ctx.response.has("Content-Length")) {
      const { length } = ctx.response;
      if (Number.isInteger(length)) ctx.length = length;
    }
    return res.end();
  }

  // status body
  if (null == body) {
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code);
    } else {
      body = ctx.message || String(code);
    }
    if (!res.headersSent) {
      ctx.type = "text";
      ctx.length = Buffer.byteLength(body);
    }
    return res.end(body);
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ("string" == typeof body) return res.end(body);
  if (body instanceof Stream) return body.pipe(res);

  // body: json
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body);
  }
  res.end(body);
}

/**
 * Make HttpError available to consumers of the library so that consumers don't
 * have a direct dependency upon `http-errors`
 */
module.exports.HttpError = HttpError;
```
