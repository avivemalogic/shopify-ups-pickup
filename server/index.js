require('isomorphic-fetch');
const dotenv = require('dotenv');
const Koa = require('koa');
const serve = require('koa-static')
const path = require('path');
const send = require('koa-send');
const cors = require('koa-cors');
const next = require('next');
const { createShopifyAuth, getQueryKey } = require("koa-shopify-auth-cookieless");
const session = require('koa-session');
const { insertAccessToken } = require('./helper');
const { createPickUpsOptions, addPickupPointScripts, addCarriersService, createWebhook } = require('./init');
const router = require('./routes');

dotenv.config();

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const sharedFilesDir = '/mnt/shared/';
const { ENV, HOST, SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, API_VERSION } = process.env;

app.prepare().then(() => {
    const server = new Koa();
    server.use(session({ secure: true, sameSite: 'none' }, server));
    server.keys = [SHOPIFY_API_SECRET_KEY];

    server.use(async (ctx, next) => {
        const forceLegacyDomain = getQueryKey(ctx, "force_legacy_domain");
        if(forceLegacyDomain){
            ctx.statusCode = 200
            ctx.set('Content-Type', 'text/html');
            ctx.body = '<script defer>parent.window.close();</script><div style="margin: auto; text-align:center;"><button style="background: #fff; min-height: 3.6rem; min-width: 3.6rem; border: 1px solid rgba(186, 191, 195, 1); border-radius: 5px; box-shadow: 0 1px 0 rgb(0 0 0 / 5%); line-height: 1; font-size: 14px; font-weight: 600; margin: 0; padding: 0.7rem 1.6rem; margin-top: 100px;" onclick="parent.window.close()">Back to Previous Page</button></div>';
            return;
        }

        if ((ctx.get('X-Forwarded-Proto') !== 'https')) {
            return ctx.redirect('https://' + ctx.get('Host') + ctx.url);
        }
        await next();
    });

    server.use(serve('./public'));

    router.all(/^\/ups-labels\/(.*)$/, async (ctx, next) => {
        if (ENV === 'production' || ENV === 'staging') {
            const filePath = path.join(sharedFilesDir, ctx.params[0]);
            await send(ctx, filePath, { root: '/' });
        } else {
            return next(); // Skip to the next middleware/route handler
        }
    });

    server.use(cors());

    server.use(
        createShopifyAuth({
            apiKey: SHOPIFY_API_KEY,
            secret: SHOPIFY_API_SECRET_KEY,
            scopes: ['write_orders','write_script_tags', 'write_shipping', 'read_products', 'write_fulfillments', 'write_assigned_fulfillment_orders', 'write_merchant_managed_fulfillment_orders'],
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
