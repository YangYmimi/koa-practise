const Koa = require("koa");
const app = new Koa();

const time = async (ctx, next) => {
  const begin = new Date().getTime();
  await next();
  const end = new Date().getTime();
  console.log(`Time: ${end - begin}ms`);
};

const welcome = async ctx => {
  ctx.response.type = "text/html";
  ctx.response.body = "<h1>Hello Koa</h1>";
};

app.use(time);
app.use(welcome);

app.listen(3000);
console.log("app started at http://localhost:3000");
