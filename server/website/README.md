# 正式域名接入配置

本目录是 `haohaoime.com` / `www.haohaoime.com` 的独立站点与续期配置，已于 2026-09-16 部署并验收。没有证书、私钥、账号邮箱或云凭据文件。

## 当前发布

- 官网：https://haohaoime.com/ 。`www` 及 HTTP 请求保留路径和查询参数，301 跳转到 HTTPS 根域名。
- DNSPod 免费解析：`@` 和 `www` 均为 A 记录，指向现有服务器 `124.221.187.214`，TTL 600。
- 页脚显示 `冀ICP备2026037417号-1`，链接至 `https://beian.miit.gov.cn/`。用户自行完成公安备案，2026-09-17 在平台「我的网站」核实状态为有效，备案号 `冀公网安备13010802002861号`；已将官方图标及链接 `https://beian.mps.gov.cn/#/query/webSearch?code=13010802002861` 加入可见页脚。
- 页面发布目录：`20260917-police-footer-v1`；回滚目录：`20260916-domain-icp-v1`。仅首页、样式及其 gzip 改变，新增官方公安备案图标；47 个清单资源完成校验，全部历史下载保留。没有修改政府备案资料、服务器配置或云翻译服务。
- 安装包仍为 3.3.27 / 20261012，APK SHA-256 为 `eb214dd56ff8ec3bae00bda1035d8c76a9e328d15b3c04ac8e97714987e12ea9`。发布元数据逐字节不变，SHA-256 为 `3dab5cf4e82f24bf91cd2907e5c56c5293ebb52b5c01a7e469f0fd3fba4c3f19`。
- Let's Encrypt 独立域名证书覆盖根域名及 `www`；首次证书到期时间为 2026-12-15 14:02:12 UTC。域名自动续期 timer 已启用，模拟续期及部署钩子检查成功；该日期会随续期变化，不应硬编码到业务逻辑。
- 原 IP HTTP/HTTPS 配置、IP 证书续期任务和语音代理未修改；已验证不发送 DNS SNI 的 IP TLS 仍返回正确 IP 证书并通过证书链校验。
- 本次服务器配置基线与恢复资料保存在 `/root/haohao-domain-20260916/`，不在网站根目录内。

## 已核实的现有布局（2026-09-16）

- 原 IP HTTP 站点是 `/www/server/panel/vhost/nginx/haohao-ime.conf`，HTTP-01 webroot 为 `/var/lib/haohao-acme`。
- 原 IP HTTPS 站点是同目录的 `haohao-speech-https.conf`，语音路由直接内联：精确 `/api/v1/speech` 转发至 `127.0.0.1:18761`，其他 `/api/` 返回 404；没有单独的语音 include。
- 原 IP 证书名为 `haohao-ip`；原 HTTPS 配置没有显式 `default_server`。原站点、语音 API、证书和续期任务必须保留。
- 网站使用 `/www/wwwroot/haohao-ime/current` 发布指针。IP HTTP 配置启用 `gzip_static`，`css/js/png/webp` 缓存 7 天，并设置 `noindex, nofollow`。
- 现有 Certbot 为 `/opt/haohao-certbot/bin/certbot` 5.8.0。原续期 timer 已启用并等待运行，在服务器本地时间 00/12 点触发并随机延迟最多 30 分钟；service 最近结果为 success。
- `/usr/local/sbin/haohao-reload-tls` 先执行 `/www/server/nginx/sbin/nginx -t`，成功后执行 `-s reload`。

## 配置边界

`zz-haohao-domain.conf` 使用独立证书目录 `/etc/letsencrypt/live/haohao-domain`，证书必须同时覆盖根域名与 `www`。安装最终配置前应已完成 DNS、HTTP-01 路径验证及证书签发；不能加载引用不存在证书的 443 配置。

HTTP 保留 ACME location，其余请求 301 到 HTTPS 根域名；`www` HTTPS 同样 301 到根域名。根域名静态站点沿用 `current`、gzip 和既有资源缓存，API 路径返回 404，不引入语音代理。只使用 TLS 1.2/1.3，保留安全响应头，不复制旧 `connect-src 'none'` CSP，不新增 HSTS。

朋友云内测期继续设置 `X-Robots-Tag: noindex, nofollow`，不扩大搜索发现范围。它不是访问控制，APK 仍然可公开下载。

独立 `haohao-domain-certbot-renew.service/timer` 只续期 `haohao-domain`，使用已有安全 reload 钩子；触发时间为服务器本地时间 03/15 点，随机延迟最多 30 分钟，`Persistent=true`。这与原 IP 续期错开；不要替换或禁用原续期任务，也不要改成无证书名限制的批量续期。

## 部署检查与回滚

- 安装位置为 `/www/server/panel/vhost/nginx/zz-haohao-domain.conf`。必须确认实际加载顺序位于 `haohao-speech-https.conf` 之后，不给新域名设置 `default_server`。若改变了 include 方式或文件名，应重新检查默认 443；仅有不同的 `server_name` 不足以保护无 SNI 的 IP TLS 客户端。
- 应先运行现有 Nginx 二进制的 `-t`，成功后再 reload。验证根域名和 `www` 的证书/SNI、重定向、首页/gzip、备案链接、`noindex`、APK Range，以及域名 `/api/` 的 404；另外单独复核无 SNI 的 IP TLS 证书与原 IP API 行为未改变。
- 独立安装并启用域名续期 timer 后，验证 unit 状态和域名证书续期流程。以后重新部署仍需验证，不能把本次验收视为永久保证。
- 如需回滚域名接入，先停止并禁用仅域名续期 timer，将仅新增的域名 vhost 移出加载目录并保留备份，`nginx -t` 成功后 reload。保留原 IP vhost、原续期任务、证书及发布目录；不要删除旧 APK。
- 页面内容回滚是独立操作：上一发布目录 `20260916-domain-icp-v1` 已保留，更早的 `20260915-friends-cloud-20261012` 也保留，不能用重建或覆盖旧目录代替发布指针的受控切换。
