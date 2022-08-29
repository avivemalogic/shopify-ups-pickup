require('isomorphic-fetch');
const dotenv = require('dotenv');
const Koa = require('koa');
const serve = require('koa-static')
const cors = require('koa-cors');
const next = require('next');
const { createShopifyAuth } = require("koa-shopify-auth-cookieless");
const session = require('koa-session');
const { insertAccessToken } = require('./helper');
const { createPickUpsOptions, addPickupPointScripts, addCarriersService, createWebhook } = require('./init');
const router = require('./routes');

dotenv.config();

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const { HOST, SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, API_VERSION } = process.env;

app.prepare().then(() => {
    const server = new Koa();
    server.use(session({ secure: true, sameSite: 'none' }, server));
    server.keys = [SHOPIFY_API_SECRET_KEY];

    server.use(async (ctx, next) => {
        if ((ctx.get('X-Forwarded-Proto') !== 'https')) {
            return ctx.redirect('https://' + ctx.get('Host') + ctx.url);
        }
        await next();
    });

    server.use(serve('./public'));
    server.use(cors());

    server.use(
        createShopifyAuth({
            apiKey: SHOPIFY_API_KEY,
            secret: SHOPIFY_API_SECRET_KEY,
            scopes: ['write_orders','write_script_tags', 'write_shipping', 'read_products', 'write_fulfillments'],
            accessMode: 'offline',
            async afterAuth(ctx) {
                const { shop, accessToken } = ctx.state.shopify;

                try {
                    await insertAccessToken(shop, accessToken);
                    await createPickUpsOptions(shop, accessToken, true);
                    await addPickupPointScripts(shop, accessToken);
                    await addCarriersService(shop, accessToken);
                    await createWebhook('orders/create', 'order-create', shop, accessToken);
                } catch (e){
                    throw new Error(e);
                }

                ctx.redirect(`https://${shop}/admin/apps/pickup-integration`);
            },
        })
    );

    server.use(router.routes())
        .use(router.allowedMethods());

    server.use(async (ctx) => {
        await handle(ctx.req, ctx.res);
        ctx.respond = false;
        ctx.res.statusCode = 200;
    });

    server.listen(port, () => {
        // ready
    });
});
