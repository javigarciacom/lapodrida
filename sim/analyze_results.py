"""Load the per-strategy/per-hand-size data dumped by find_best_per_size.py
and print the winners table plus the JS routing hint. Separated so we can
re-derive the ranking without rerunning the (slow) simulations.
"""

import json
import statistics
import sys


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/best_per_size_data.json"
    with open(path) as f:
        obj = json.load(f)

    names = sorted(obj.keys())
    sizes = sorted({int(hs) for name in obj for hs in obj[name]})

    # Per-strategy tables
    for name in names:
        print(f"==== {name} ====")
        print(f"{'hs':>3}  {'pts':>6}  {'hit%':>6}  {'bid':>5}  {'trk':>5}  {'bias':>5}  {'under%':>6}  {'n':>5}")
        for hs in sizes:
            data = obj[name].get(str(hs))
            if not data or not data["points"]:
                continue
            pts = data["points"]; bids = data["bids"]; tricks = data["tricks"]
            mean_pts = statistics.mean(pts)
            hit = sum(1 for b, t in zip(bids, tricks) if b == t) / len(bids)
            under = sum(1 for b, t in zip(bids, tricks) if b < t) / len(bids)
            bid_m = statistics.mean(bids); trk_m = statistics.mean(tricks)
            print(f"{hs:>3}  {mean_pts:>+6.2f}  {hit*100:>5.1f}%  "
                  f"{bid_m:>5.2f}  {trk_m:>5.2f}  {bid_m-trk_m:>+5.2f}  "
                  f"{under*100:>5.1f}%  {len(pts):>5}")
        print()

    # Winners per size
    print("==== WINNERS PER HAND SIZE ====")
    print(f"{'hs':>3}  {'strategy':<38}  {'pts':>6}  {'hit%':>6}  {'bid':>5}")
    winners: dict[int, str] = {}
    for hs in sizes:
        ranked = []
        for name in names:
            d = obj[name].get(str(hs))
            if not d or not d["points"]: continue
            mean_pts = statistics.mean(d["points"])
            hit = sum(1 for b, t in zip(d["bids"], d["tricks"]) if b == t) / len(d["bids"])
            bid_m = statistics.mean(d["bids"])
            ranked.append((name, mean_pts, hit, bid_m))
        ranked.sort(key=lambda t: t[1], reverse=True)
        if not ranked:
            continue
        top = ranked[0]
        winners[hs] = top[0]
        print(f"{hs:>3}  {top[0]:<38}  {top[1]:>+6.2f}  {top[2]*100:>5.1f}%  {top[3]:>5.2f}")
        for rn in ranked[1:3]:
            print(f"{'':>3}  {'  ' + rn[0]:<38}  {rn[1]:>+6.2f}  {rn[2]*100:>5.1f}%  {rn[3]:>5.2f}")

    print("\n==== suggested JS routing ====")
    print("// handSize → chosen strategy")
    for hs in sizes:
        print(f"//   {hs}: {winners.get(hs, '—')}")


if __name__ == "__main__":
    main()
