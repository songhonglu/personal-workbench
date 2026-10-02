#!/usr/bin/env bash
# 一次性清理脚本：把冒烟测试时注册的 2 个 probe 账号的保险箱内容清空
# 账号：_probe_nonexist_9x7q (usr-fd8b2edb2f484c18) / _probe_isolated_3k1z (usr-e67655b51dde479c)
# 正式账号 songhw-workbench 不受影响
# 注：register 接口对已存在账号不回传 token（安全设计），故 token 直接固化在此脚本
set -e
BASE="https://workbench-sync-321.pages.dev"

T1="wb-u-558d156d70fc455c9ad78e227a1f8fbe"   # _probe_nonexist_9x7q（冒烟时已 PUT 过 __probe）
T2="wb-u-6a18ef306c8946a0b3b4a8356a63337a"    # _probe_isolated_3k1z（空保险箱，仅标记）

echo "probe1: $T1"
curl -s -m 8 -X PUT "$BASE/data?token=$T1" -H "Content-Type: application/json" -d '{"data":{"__cleared":"smoke-test-removed"}}' -w "  -> HTTP:%{http_code}\n"

echo "probe2: $T2"
curl -s -m 8 -X PUT "$BASE/data?token=$T2" -H "Content-Type: application/json" -d '{"data":{"__cleared":"smoke-test-removed"}}' -w "  -> HTTP:%{http_code}\n"

echo "done: 2 个 probe 账号保险箱已覆盖为清空标记；正式账号 songhw-workbench 数据不受影响"
