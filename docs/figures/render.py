"""วาดรูปใน docs/figures/src/*.html เป็น PNG (ตัวคูณ 2) · ใช้: python render.py [ชื่อ ...]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
src = pathlib.Path(__file__).parent / 'src'
out = pathlib.Path(__file__).parent
names = {'fig01-context': 'IEGEN-SRS-fig01-context.png', 'fig02-flow': 'IEGEN-SRS-fig02-flow.png'}
want = sys.argv[1:] or list(names)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(device_scale_factor=2, viewport={'width': 1700, 'height': 900})
    for n in want:
        pg.goto((src / f'{n}.html').as_uri()); pg.wait_for_timeout(300)
        # ตรวจข้อความที่ล้นกล่องหรือเล็กกว่า 26px
        bad = pg.evaluate("""()=>{const r=[];document.querySelectorAll('.card b,.card span,.lbl,.note,.legend,.cap b,h1,.sub').forEach(e=>{
          if(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2) if(getComputedStyle(e).position!=='static'&&!e.classList.contains('lbl')&&!e.classList.contains('note')&&!e.classList.contains('legend')) r.push('ล้น: '+e.textContent.trim().slice(0,30));
          const f=parseFloat(getComputedStyle(e).fontSize); if(f<26) r.push('เล็ก '+f+': '+e.textContent.trim().slice(0,20));});return r}""")
        print(n, 'problems:', len(bad), bad)
        pg.locator('.sheet').screenshot(path=str(out / names[n]))
    b.close()
