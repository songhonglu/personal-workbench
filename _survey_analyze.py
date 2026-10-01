#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计 _survey_data.json，输出 _survey_stats.json"""
import json, collections, io, os

base = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(base, "_survey_data.json"), encoding="utf-8"))
rs = d["responses"]
N = len(rs)

# ---------- 行业分组 ----------
industry_count = collections.Counter(r["industry"] for r in rs)

# ---------- 设备分布 ----------
device_count = collections.Counter(r["device"] for r in rs)

# ---------- 模块使用频率（1-5 频率分） ----------
mod_use = collections.Counter()
for r in rs:
    for k, v in r["module_use"].items():
        mod_use[k] += v

mod_names = {"todo":"待办","checkin":"习惯打卡","progress":"长期目标","finance":"记账","note":"随手记"}
# 使用率：frequency>=4 视为高频使用
mod_high_use = collections.Counter()
for r in rs:
    for k, v in r["module_use"].items():
        if v >= 4:
            mod_high_use[k] += 1

# ---------- 增强功能使用 ----------
en_use = collections.Counter()
en_high = collections.Counter()
for r in rs:
    for k, v in r["enhance_use"].items():
        en_use[k] += v
        if v >= 4:
            en_high[k] += 1
en_names = {"transfer":"转账","dup":"复刻上一条","batch":"批量操作","note2todo":"笔记转待办","mute":"提醒静音"}

# ---------- 满意度 ----------
sat = collections.Counter()
for r in rs:
    for k, v in r["sat"].items():
        sat[k] += v
sat_avg = {k: round(v/N, 2) for k, v in sat.items()}

# ---------- 关注点（多选） ----------
concern = collections.Counter()
for r in rs:
    for c in r["concerns"]:
        concern[c] += 1

# ---------- 痛点（多选，自由文本归类） ----------
pain = collections.Counter()
for r in rs:
    for p in r["pains"]:
        pain[p] += 1

# ---------- NPS ----------
promoters = sum(1 for r in rs if r["nps"] >= 9)
passives = sum(1 for r in rs if 7 <= r["nps"] <= 8)
detractors = sum(1 for r in rs if r["nps"] <= 6)
nps = round((promoters - detractors) / N * 100, 1)
avg_nps = round(sum(r["nps"] for r in rs) / N, 2)

# ---------- 数据安全 ----------
backup = collections.Counter(r["backup"] for r in rs)

# ---------- 使用天数 ----------
avg_days = round(sum(r["days"] for r in rs) / N, 1)

# ---------- 行业 × 模块高频使用（找差异化关注） ----------
industry_top_module = {}
for ind in industry_count:
    cnt = collections.Counter()
    for r in rs:
        if r["industry"] != ind: continue
        for k, v in r["module_use"].items():
            if v >= 4:
                cnt[k] += 1
    top = cnt.most_common(2)
    industry_top_module[ind] = [ (mod_names[k], v, N//industry_count[ind]) for k, v in top ]

stats = {
    "n": N,
    "industry_count": dict(industry_count),
    "device_count": dict(device_count),
    "avg_days": avg_days,
    "mod_avg_freq": {mod_names[k]: round(v/N, 2) for k, v in mod_use.items()},
    "mod_high_use": {mod_names[k]: mod_high_use.get(k, 0) for k in mod_use},
    "en_avg_freq": {en_names[k]: round(v/N, 2) for k, v in en_use.items()},
    "en_high_use": {en_names[k]: en_high.get(k, 0) for k in en_use},
    "sat_avg": sat_avg,
    "concern": concern.most_common(),
    "pain": pain.most_common(),
    "nps": {"nps": nps, "promoters": promoters, "passives": passives, "detractors": detractors, "avg_nps": avg_nps},
    "backup": dict(backup),
    "industry_top_module": industry_top_module,
}

out = os.path.join(base, "_survey_stats.json")
json.dump(stats, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# 同时打印摘要
print("=== 统计摘要 ===")
print(f"样本 N={N}, 行业数={len(industry_count)}, 平均使用 {avg_days} 天")
print(f"\n模块平均频率(1-5): {json.dumps(stats['mod_avg_freq'], ensure_ascii=False)}")
print(f"模块高频使用人数: {json.dumps(stats['mod_high_use'], ensure_ascii=False)}")
print(f"增强功能平均频率: {json.dumps(stats['en_avg_freq'], ensure_ascii=False)}")
print(f"增强功能高频人数: {json.dumps(stats['en_high_use'], ensure_ascii=False)}")
print(f"满意度: {json.dumps(sat_avg, ensure_ascii=False)}")
print(f"关注点 Top: {concern.most_common(8)}")
print(f"痛点 Top: {pain.most_common(8)}")
print(f"NPS={nps} (推荐{promoters} 中立{passives} 贬损{detractors}) avg={avg_nps}")
print(f"数据备份: {dict(backup)}")
print(f"\n行业核心模块偏好:")
for ind, top in industry_top_module.items():
    print(f"  {ind}: " + " / ".join(f"{n}(高频{c}/{tot})" for n, c, tot in top))
print(f"\n已写出: {out}")
