# 部署报告:服务器域名字/HTTPS/手机远程控 Agent(2026-09-06)

> 一天之内完成:Cloudflare 接入、简历站 HTTPS、Orca ADE 手机远程控制、代码上库。
> 服务器:Aliyun 香港 `8.218.79.152`(Ubuntu 24.04 x86_64,7GB)。
> 域名:`nodetime.top`(阿里云购买,DNS 已迁 Cloudflare)。

## 一、最终架构

```
                        公网零开放端口(安全组可全关)
访客/手机
   │ HTTPS(CF 边缘证书,Universal SSL)
   ▼
Cloudflare 香港边缘 ─── DNS 代理(nodetime.top 全域)
   │ QUIC 加密隧道(cloudflared 主动外连,systemd 常驻)
   ▼
服务器 8.218.79.152
   ├─ resume.nodetime.top → nginx:443(LE 证书 + certbot 自动续期)→ web/server 容器
   └─ orca.nodetime.top   → orca serve :6768(手机 Orca App 远程控制 Agent)
```

**一个子域名 = 一个独立能力**:根域名/`www` 留白(404 兜底),不放简历。

## 二、完成清单

| 事项 | 结果 |
|---|---|
| DNS 迁移 | 阿里云 hichina → Cloudflare(kobe/joselyn.ns.cloudflare.com),注册局验证生效 |
| Cloudflare Tunnel | cloudflared v2026.8.3,systemd 服务,4×QUIC 连接(香港) |
| 简历站域名 | `https://resume.nodetime.top`(经隧道,CF 边缘 TLS) |
| 源站 HTTPS | Let's Encrypt 证书(certbot **standalone 签发,HTTP-01 验证穿透隧道完成,无需开公网端口**),有效期至 2026-12-05,compose 内 certbot 服务 12h 自动续期 + nginx 6h 热加载 |
| 隧道源站校验 | resume 路由 `https://localhost:443` + `originServerName`,三层 TLS 全校验 |
| Orca ADE | v1.4.197(deb),`orca serve --pairing-address wss://orca.nodetime.top --mobile-pairing`,systemd 常驻,手机已配对 |
| Orca 项目 | `orca repo add` 注册本仓库,手机可见 |
| 代码上库 | `github.com/1207575273/resume-online`(main,88 文件,.env 正确排除) |
| CF API 自动化 | API Token 存 `~/.cloudflare/api-token`(600),以后 DNS/隧道路由变更全走 API,不再进面板 |

## 三、常用命令速查

```bash
# 服务状态/日志
systemctl status orca-serve cloudflared
sudo journalctl -u orca-serve -n 50 -o cat

# 重新生成手机配对链接(服务重启后旧链接失效)
sudo systemctl restart orca-serve
sudo journalctl -u orca-serve --no-pager -o cat | grep -o 'orca://pair?code=.*' | tail -1

# Orca 项目管理
orca project list
orca repo add --path /绝对路径          # 注册新项目
orca worktree list

# HTTPS(项目自带)
bash script/setup-https.sh             # 首次签发
bash deploy/deploy.sh prod             # 起生产栈(80/443 + certbot)
docker compose -f deploy/compose.yaml -f deploy/compose.prod.yaml ps

# Cloudflare API(DNS/隧道路由,Token 在 ~/.cloudflare)
# zone id 见 ~/.cloudflare/zone.conf
```

## 四、教训总结

1. **验证要验到正文,不止状态码。** 曾出现"HTTP 200 一切正常"的假象,实际没检查 HTML/静态资源/API 内容;排障时首页、资源、接口要分层验证。
2. **手抄长凭证必错。** 配对链接人工复写时错一个字符导致"认证拒绝";凭证传递必须走管道/文件(`cat`/`tee`/重定向),不出人手。
3. **CF 521 ≠ 源站挂了。** 根因是 Zone SSL 模式(Full)会敲源站 443,而源站只监听 80。全部流量走 Tunnel 后与 SSL 模式解耦,问题类别直接消失。
4. **先隔离本地网络再怪服务器。** "网站打不开"最后定位是本机 Clash 代理;手机 4G/热点或关代理是快速二分法。
5. **DNS 判断以注册局为准。** 公共 DNS(1.1.1.1/223.5.5.5)有缓存,`dig @<TLD权威服务器> NS domain` 才是生效真相;挂后台轮询比反复手动查优雅。
6. **内网工具绝不裸奔公网。** Orca 端口、管理面板类服务的 pairing token 是永久凭证且明文 HTTP,唯一正解是隧道/私网;服务器保持"零开放端口"姿态。
7. **域名设计要解耦。** 根域名是门面留白,一个子域名一个独立功能,以后加能力互不污染。
8. **`.env` 永不进库,且要验证。** 提交前 `git check-ignore .env` 实测,不靠肉眼;密钥类配置(如 ccode 的 apiKey)只落本地文件(600/600 目录权限)。
9. **pnpm 全局目录问题一键修。** `ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH` → `pnpm setup` + `source ~/.bashrc`,别手动拼 PNPM_HOME(容易拼错一层目录)。
10. **Orca"No Projects found" = 服务器端没注册项目。** 手机端"新建"建的是 worktree,前提是有 project;服务器 CLI `orca repo add --path` 服务端补齐最快。
11. **证书签发可以完全不开公网端口。** certbot standalone 监听本机 80,ACME 验证请求经 CF 代理 → 隧道到达,链路天然成立。

## 五、遗留事项

- [ ] 可选:阿里云安全组关闭 80/443 入站,只留隧道(当前 80/443 仍开着,旧 IP 直连可用)
- [ ] 可选:`orca account add --agent claude` 注册 Orca 托管账号(当前用服务器上已登录的 claude CLI,已可用)
- [ ] codex/gemini CLI 未安装,需要时补
- [ ] 新的 `workspace` 容器项目暂为本地 git,需要远端时在 GitHub 建仓后补 remote
