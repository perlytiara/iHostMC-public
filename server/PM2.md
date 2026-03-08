# iHostMC relay – PM2

Public relay runs under PM2 so it stays up and restarts on failure.

## Start (from repo root or server/)

```bash
cd /opt/iHostMC/server   # or path to iHostMC/server
pm2 start ecosystem.config.cjs
```

## Commands

- **Status**: `pm2 list` (look for `ihostmc-relay-frps`, `ihostmc-relay-port-api`)
- **Logs**: `pm2 logs ihostmc-relay-frps` or `pm2 logs ihostmc-relay-port-api`
- **Restart**: `pm2 restart ihostmc-relay-frps` or `pm2 restart ihostmc-relay-port-api`
- **Stop**: `pm2 stop ihostmc-relay-frps ihostmc-relay-port-api`

## After reboot

If you ran `pm2 startup` and `pm2 save`, PM2 will restore the relay on boot. Otherwise run:

```bash
cd /opt/iHostMC/server && pm2 start ecosystem.config.cjs
```

## Ports

- **7000** – frps (FRP server; clients connect here)
- **8081** – port-api (assign/release port; only accepts `Host: play.ihost.one`)

Your coworker can try the app: install iHostMC, set tunnel method to **FRP**, use **Share server** – no token needed for the default relay.
