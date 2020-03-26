### Koa-Compose

源码解读

```javascript
"use strict";

/**
 * Expose compositor.
 */

module.exports = compose;

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */
// compose 参数是中间件数组，数组的每项都是一个中间件处理函数
// 所以第一步校验参数
function compose(middleware) {
  if (!Array.isArray(middleware))
    throw new TypeError("Middleware stack must be an array!");
  for (const fn of middleware) {
    if (typeof fn !== "function")
      throw new TypeError("Middleware must be composed of functions!");
  }

  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */
  // context 就是 Koa 中的上下文 ctx
  return function(context, next) {
    // last called middleware #
    let index = -1;
    return dispatch(0);
    function dispatch(i) {
      if (i <= index)
        return Promise.reject(new Error("next() called multiple times"));
      index = i;
      // 取出第i个中间件函数，i为0的时候就是中间件数组中第一个
      let fn = middleware[i];
      if (i === middleware.length) fn = next; // 如果 i 是最后一个，fn 则为 next 函数，一定是空的
      if (!fn) return Promise.resolve();
      // 若数组下标并未到达最后一位，且存在当前中间件函数则执行当前函数并传入 dispatch(i + 1)，
      try {
        // 返回链式调用
        // 递归调用 dispatch
        // bind 是为了确认 this 指向
        // next 函数就是这边的 dispatch.bind(null, i + 1)
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}
```
