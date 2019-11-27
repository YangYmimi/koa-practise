const Koa = require('koa');
const KoaRouter = require('koa-router');
const bodyParser = require('koa-bodyparser');

const app = new Koa();
const router = new KoaRouter();

// Index route
router.get('/', async (ctx, next) => {
  // await next();
  ctx.response.body = '<h1>Index</h1>';
});

router.get('/user/:name', async (ctx, next) => {
  // await next();
  ctx.response.body = `<h1>Welcome: ${ctx.params.name}</h1>`;
});

router.get('/login', async (ctx, next) => {
  ctx.response.body = `
    <h1>Index</h1>
      <form action="/signin" method="post">
        <p>Name: <input name="username" value="koa"></p>
        <p>Password: <input name="password" type="password"></p>
        <p><input type="submit" value="Submit"></p>
      </form>
    `;
});

router.post('/signin', async (ctx, next) => {
  const { username, password } = ctx.request.body
  if (password === 'admin') {
    ctx.response.body = `
      <p>Login Successfully.</p>
      <p>Welcome, ${username}</p>
    `;
  } else {
    ctx.response.body = `
      <p>Login Failed.</p>
      <p>Try Again.</p>
    `;
  }
});

// register before router
app.use(bodyParser());

// add router middlewares
app.use(router.routes());

app.listen(3000);
console.log('app started at http://localhost:3000');