const Koa = require('koa');
const app = new Koa();

app.use(async (ctx, next) => {
  await next(); // await 其他的 async 函数执行完毕
  ctx.response.type = 'text/html'; // 设置 Content-Type
  ctx.response.body = '<h1>Hello Koa</h1>'
});

app.listen(3000);
console.log('app started at http://localhost:3000');