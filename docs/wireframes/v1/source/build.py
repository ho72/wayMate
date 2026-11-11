#!/usr/bin/env python3
"""Build review-only SVG storyboard, PDF, Markdown and a local document viewer."""
from pathlib import Path
import hashlib
import html
import json
import math
import re
import sys

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

from spec import SCREENS, SOURCES, VERSION, DATE, BASE_COMMIT

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT.parents[1]
FONT = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
if not Path(FONT).exists():
    FONT = "/Library/Fonts/Arial Unicode.ttf"
pdfmetrics.registerFont(TTFont("KR", FONT))
W, H = 1191, 842
INK, MUTED, LINE, PALE = "#242424", "#666666", "#B8B8B8", "#F4F4F4"
ERRORS = []

def wrap(text, width, size):
    lines = []
    for para in str(text).split("\n"):
        current = ""
        for ch in para:
            trial = current + ch
            if current and pdfmetrics.stringWidth(trial, "KR", size) > width:
                lines.append(current.rstrip())
                current = ch.lstrip()
            else:
                current = trial
        lines.append(current)
    return lines

class Page:
    def __init__(self, key, title, page_no, pdf):
        self.key, self.title, self.no, self.pdf = key, title, page_no, pdf
        self.svg = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">',
            f'<title id="title">{html.escape(title)}</title>',
            '<desc id="desc">wayMate 목업 검토용 화면 설계도. 번호는 화면 및 요소 피드백 식별자다.</desc>',
            '<rect width="1191" height="842" fill="white"/>',
        ]
        self.rect(0, 0, W, H, fill="#FFFFFF", stroke=None)
        pdf.bookmarkPage(key)
        pdf.addOutlineEntry(title, key, level=0, closed=False)
        self.text("wayMate / 화면 설계서", 40, 28, 11, color=MUTED)
        self.text(f"v{VERSION}  |  {DATE}  |  피드백 번호 {key}", 780, 28, 10, color=MUTED)
        self.line(40, 48, W-40, 48)
        self.text(title, 40, 63, 24)
        self.line(40, H-38, W-40, H-38)
        self.text("목업 설계 · 담당자 미정 · 마감 미정 · 실제 기능/주행/SDK 검증 완료를 뜻하지 않음", 40, H-27, 9, color=MUTED)
        self.text(f"{page_no:02d}", W-70, H-28, 11)

    def rect(self, x, y, w, h, fill="#FFFFFF", stroke=LINE, radius=0, dash=False):
        attrs = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill or "none"}" stroke="{stroke or "none"}"'
        self.svg.append(f'<rect {attrs} stroke-width="1"'+(' stroke-dasharray="4 3"' if dash else '')+'/>')
        c=self.pdf;c.saveState()
        c.setLineWidth(.75)
        if dash:c.setDash(4,3)
        if fill:c.setFillColor(HexColor(fill))
        if stroke:c.setStrokeColor(HexColor(stroke))
        if radius:c.roundRect(x,H-y-h,w,h,radius,stroke=int(bool(stroke)),fill=int(bool(fill)))
        else:c.rect(x,H-y-h,w,h,stroke=int(bool(stroke)),fill=int(bool(fill)))
        c.restoreState()

    def line(self,x1,y1,x2,y2,color=LINE,width=1):
        self.svg.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"/>')
        self.pdf.saveState();self.pdf.setStrokeColor(HexColor(color));self.pdf.setLineWidth(width)
        self.pdf.line(x1,H-y1,x2,H-y2);self.pdf.restoreState()

    def ellipse(self,x,y,w,h,fill=PALE,stroke=LINE):
        self.svg.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill or "none"}" stroke="{stroke or "none"}"/>')
        self.pdf.saveState()
        if fill:self.pdf.setFillColor(HexColor(fill))
        if stroke:self.pdf.setStrokeColor(HexColor(stroke))
        self.pdf.ellipse(x,H-y-h,x+w,H-y,stroke=int(bool(stroke)),fill=int(bool(fill)))
        self.pdf.restoreState()

    def text(self,txt,x,y,size=12,color=INK,width=None,lineheight=None,max_height=None,align="left",link=None):
        lh=lineheight or size*1.5
        lines=wrap(txt,width,size) if width else str(txt).split("\n")
        if max_height is not None and len(lines)*lh > max_height+.1:
            ERRORS.append((self.key,str(txt)[:40],round(len(lines)*lh,1),max_height))
        self.pdf.saveState();self.pdf.setFillColor(HexColor(color));self.pdf.setFont("KR",size)
        for i,l in enumerate(lines):
            yy=y+i*lh
            xx=x
            if align=="center":xx-=pdfmetrics.stringWidth(l,"KR",size)/2
            if align=="right":xx-=pdfmetrics.stringWidth(l,"KR",size)
            self.svg.append(f'<text x="{xx}" y="{yy+size}" font-family="AppleGothic,Apple SD Gothic Neo,Malgun Gothic,sans-serif" font-size="{size}" fill="{color}">{html.escape(l)}</text>')
            self.pdf.drawString(xx,H-yy-size,l)
        if link:
            if link.startswith("WF-") or link.startswith("OV-"):
                self.pdf.linkRect("",link,(x,H-y-lh*len(lines),x+(width or 250),H-y),relative=0,thickness=0)
            else:self.pdf.linkURL(link,(x,H-y-lh*len(lines),x+(width or 250),H-y),relative=0,thickness=0)
        self.pdf.restoreState()
        return len(lines)*lh

    def marker(self,n,x,y):
        self.ellipse(x-10,y-10,20,20,fill=INK,stroke=INK)
        self.text(str(n),x,y-7,10,color="#FFFFFF",align="center")

    def agent(self,x,y,size,peer=False):
        # Geometry follows the existing Compose TravelFriend component; grayscale for wireframes.
        self.ellipse(x,y,size,size,fill="#EEEEEE",stroke=None)
        self.ellipse(x+.19*size,y+.27*size,.62*size,.58*size,fill="#FFFFFF",stroke=INK)
        self.ellipse(x+.46*size,y+.12*size,.22*size,.14*size,fill="#777777",stroke=None)
        self.line(x+.5*size,y+.31*size,x+.54*size,y+.2*size,INK,2)
        for r,cx,cy in [(.022,.39,.52),(.022,.61,.52)]:
            self.ellipse(x+(cx-r)*size,y+(cy-r)*size,2*r*size,2*r*size,INK,None)
        for cx in [.3,.7]:self.ellipse(x+(cx-.044)*size,y+.566*size,.088*size,.088*size,"#DDDDDD",None)
        # A simple smile is a notation reuse of the existing quadratic path.
        pts=[]
        for i in range(13):
            t=i/12
            px=(1-t)**2*.43+2*(1-t)*t*.5+t*t*.57
            py=(1-t)**2*.62+2*(1-t)*t*.7+t*t*.62
            pts.append((x+px*size,y+py*size))
        for a,b in zip(pts,pts[1:]):self.line(*a,*b,INK,max(.8,size*.012))
        if peer:self.text("B",x+size-14,y+2,9,color=MUTED)

    def finish(self):
        self.svg.append("</svg>")
        (ROOT/"pages"/f"{self.key}.svg").write_text("\n".join(self.svg))
        self.pdf.showPage()

def section(p,title,x,y,w,body):
    p.text(title,x,y,13)
    p.line(x,y+25,x+w,y+25)
    return y+35+p.text(body,x,y+35,11,width=w,lineheight=18)+18

def context(p,x,y,w,nav="D",ratio="2:1",label=True,mode="hero"):
    h=w*.49
    p.rect(x,y,w,h,fill="#FAFAFA",stroke=INK)
    bar=20;gnb=20;drive=w*.11
    p.rect(x,y,w,bar,fill="#EAEAEA")
    p.text("시스템 상태 영역",x+8,y+4,8)
    p.rect(x,y+bar,drive,h-bar-gnb,fill="#EAEAEA")
    p.text("드라이빙\n뷰",x+7,y+bar+20,8,width=drive-12)
    apps=w-drive
    own=apps/(3 if ratio=="2:1" else 2)
    nw=apps-own
    p.rect(x+drive,y+bar,nw,h-bar-gnb,fill="#F8F8F8")
    p.text("순정 내비 / 시스템 관리",x+drive+10,y+bar+8,9,width=nw-16)
    route={"D":"기존 목적지 D","M":"M 경유 → D 유지","newD":"승인한 새 목적지 D","pending":"승인 전 상태 유지 (D 또는 없음)","?":"반영 여부 확인 필요","none":"목적지 없음"}[nav]
    p.text(route,x+drive+10,y+bar+33,9,width=nw-16)
    if nav not in ["none","?","pending"]:
        p.line(x+drive+16,y+h*.72,x+drive+nw*.45,y+h*.50,LINE,2)
        p.line(x+drive+nw*.45,y+h*.50,x+drive+nw-20,y+h*.63,LINE,2)
    p.rect(x+drive+nw,y+bar,own,h-bar-gnb,fill="#FFFFFF",stroke=INK)
    p.text("wayMate",x+drive+nw+7,y+bar+8,9)
    ax=x+drive+nw
    if mode=="hero":
        p.agent(ax+own*.28,y+bar+35,own*.44)
        p.line(ax+8,y+h-gnb-17,ax+own-8,y+h-gnb-17)
    elif mode=="compact":
        p.agent(ax+7,y+bar+25,own*.23)
        for j in range(3):p.rect(ax+8,y+bar+own*.28+33+j*13,own-16,9,fill=PALE,stroke=LINE)
    elif mode=="voice":
        p.agent(ax+7,y+bar+27,own*.23)
        p.text("음성 대화",ax+8,y+bar+65,8,width=own-16)
    elif mode=="restricted":
        p.text("조작 제한\n주차 후 계속",ax+8,y+bar+38,8,width=own-16)
    else:
        for j in range(2):p.rect(ax+8,y+bar+30+j*27,own-16,22,fill=PALE,stroke=LINE)
    p.rect(x,y+h-gnb,w,gnb,fill="#EAEAEA")
    p.text("시스템 GNB / 공조",x+8,y+h-gnb+4,8)
    if label:p.text(f"배치 개념도 · 앱 창 비율 {ratio} · 실차 해상도/순정 UI 재현 아님",x,y+h+8,8.5,color=MUTED,width=w)
    return h+34

def chat_editor(p,s,x,y,w,h):
    pad=17; inner=w-2*pad
    p.agent(x+pad,y+58,47);p.marker(2,x+w-20,y+82)
    p.text("내 친구",x+pad+61,y+70,11)
    p.rect(x+pad,y+120,inner,69,fill=PALE,stroke=None,radius=3)
    p.text(s["speech"],x+pad+12,y+131,12,width=inner-24,lineheight=18)
    p.marker(3,x+5,y+141)
    p.text("보낸 답변은 네 말투 그대로 남겨둘게.",x+pad,y+210,10.5,width=inner)
    p.text("예시 · 안 골라도 괜찮아",x+pad,y+278,10,color=MUTED)
    for i,label in enumerate(["바다 보며 쉬기", "카페 가는 날"]):
        xx=x+pad+i*(inner/2+4)
        p.rect(xx,y+301,inner/2-4,34,fill="#F4F4F4",radius=14)
        p.text(label,xx+(inner/2-4)/2,y+311,10,align="center")
    p.text("답변 입력",x+pad,y+352,11)
    p.rect(x+pad,y+374,inner,94,stroke=INK,radius=3)
    p.text("편하게 네 말로 적어줘…",x+pad+12,y+388,12,color=MUTED,width=inner-24)
    p.text("0 / 500 · Enter 줄바꿈",x+w-pad,y+476,9,color=MUTED,align="right")
    p.marker(4,x+5,y+401)
    for i,a in enumerate(s["actions"]):
        yy=y+h-110+i*49
        p.rect(x+pad,yy,inner,41,fill="#FAFAFA" if i==0 else PALE,stroke=LINE if i==0 else INK,radius=3,dash=i==0)
        p.text(a["label"]+(" [입력 후]" if i==0 else ""),x+w/2,yy+12,11.5,align="center",color=MUTED if i==0 else INK)
        if i==0:p.marker(5,x+5,yy+20)

def driving_voice(p,s,x,y,w,h):
    pad=17;inner=w-2*pad
    p.agent(x+pad,y+67,48,peer=True);p.marker(2,x+w-20,y+91)
    p.text(s["speaker"],x+pad+63,y+80,12,width=inner-66)
    p.text("공개 소개 기반",x+pad,y+145,10,color=MUTED)
    p.rect(x+pad,y+208,inner,84,fill=PALE,stroke=None,radius=3)
    p.text(s["speech"],x+w/2,y+235,19,align="center");p.marker(3,x+5,y+240)
    p.text("편하게 말하고, 원할 때 쉬어가요.",x+pad,y+325,10,color=MUTED,width=inner)
    p.marker(4,x+5,y+340)
    p.line(x+pad,y+h-111,x+w-pad,y+h-111)
    p.text("음성 명령",x+pad,y+h-96,10,color=MUTED)
    p.text("“잠깐 쉬자”     “대화 그만”",x+pad,y+h-69,12,width=inner)
    p.marker(5,x+5,y+h-61)


def app(p,s,x=378,y=138,w=354,h=612):
    p.rect(x,y,w,h,stroke=INK,radius=4)
    pad=17;inner=w-pad*2
    p.text("wayMate",x+pad,y+14,14)
    tag="주차 · 모의 시연" if s["scope"] in ["B","E","O"] else "설계"
    if s["channel"]=="mobile":tag="모바일 · 목업"
    if s["id"]=="WF-032":tag="사용 제한"
    if s["id"]=="WF-051":tag="목표 · 지원 검증 전"
    p.text(tag,x+w-pad,y+18,9,color=MUTED,align="right")
    p.marker(1,x+5,y+23)
    p.line(x+pad,y+46,x+w-pad,y+46)
    if s["id"]=="WF-002":
        chat_editor(p,s,x,y,w,h);return
    if s["id"]=="WF-051":
        driving_voice(p,s,x,y,w,h);return
    yy=y+58
    mode=s["mode"]
    if mode=="hero":
        size=145
        p.agent(x+(w-size)/2,yy,size,peer="솔바람의 캐릭터" in s["speaker"])
        p.marker(2,x+w-20,yy+size/2)
        yy+=size+10
        p.text(s["speaker"],x+w/2,yy,11,color=MUTED,align="center");yy+=25
    elif mode=="compact":
        p.agent(x+pad,yy,47,peer="솔바람의 캐릭터" in s["speaker"])
        p.text(s["speaker"],x+pad+60,yy+12,11,width=inner-66,max_height=38)
        p.marker(2,x+w-20,yy+24);yy+=62
    else:
        p.text(s["speaker"],x+pad,yy,10,color=MUTED,width=inner)
        yy+=25
    speech_lines=wrap(s["speech"],inner-24,12)
    sh=max(52,len(speech_lines)*17+20)
    p.rect(x+pad,yy,inner,sh,fill="#F1F1F1",stroke=None,radius=3)
    p.text(s["speech"],x+pad+12,yy+10,12,width=inner-24,lineheight=17,max_height=sh-18)
    p.marker(3,x+5,yy+20);yy+=sh+14
    ah=41;gap=8
    action_total=len(s["actions"])*ah+max(0,len(s["actions"])-1)*gap
    bottom=y+h-20
    card_area=bottom-yy-action_total-18
    count=len(s["cards"])
    per=(card_area-max(0,count-1)*8)/max(1,count)
    if per<42:ERRORS.append((s["id"],"card area too small",per,42))
    for i,c in enumerate(s["cards"]):
        p.rect(x+pad,yy,inner,per,fill="#FFFFFF",stroke=LINE,radius=2)
        p.text(c["title"],x+pad+10,yy+8,11.5,width=inner-20,lineheight=15,max_height=30)
        title_h=len(wrap(c["title"],inner-20,11.5))*15
        body_h=p.text(c["body"],x+pad+10,yy+11+title_h,10.5,width=inner-20,lineheight=14,
                      max_height=per-title_h-20-(15 if c["meta"] else 0))
        if c["meta"]:p.text(c["meta"],x+pad+10,yy+13+title_h+body_h,9.3,color=MUTED,width=inner-20,lineheight=12,max_height=per-title_h-body_h-15)
        if i==0:p.marker(4,x+5,yy+18)
        yy+=per+8
    yy=bottom-action_total
    for i,a in enumerate(s["actions"]):
        enabled=a["enabled"]
        p.rect(x+pad,yy,inner,ah,fill="#E5E5E5" if enabled else "#FAFAFA",stroke=INK if enabled else LINE,radius=3,dash=not enabled)
        label=a["label"]+("" if enabled else " [잠금]")
        p.text(label,x+w/2,yy+12,11.5,color=INK if enabled else MUTED,align="center")
        if i==0:p.marker(5,x+5,yy+20)
        yy+=ah+gap

def screenpage(p,s):
    channel={"mobile":"모바일","car":"차량","operator":"시연자"}[s["channel"]]
    scope={"B":"기본 목업","E":"이번 요청 확장","O":"기존 추가"}[s["scope"]]
    p.text(f"{channel}  |  {scope}  |  {s['mapping']}  |  {s['scene']} / {s['dm']}",40,104,11,color=MUTED,width=1110)
    left=40;lw=310
    yy=140
    if s["channel"]=="car":
        p.text("배치 문맥 / 내비 + 우측 앱",left,yy,12)
        yy+=30+context(p,left,yy+28,lw,s["nav"],mode="restricted" if s["id"]=="WF-032" else s["mode"])
        yy+=12
    elif s["channel"]=="mobile":
        p.text("모바일 준비 / 차량과 동일 정보",left,yy,12)
        yy+=32
    else:
        p.text("시연 PC의 별도 제어 화면",left,yy,12)
        yy+=32
    if s["channel"]!="operator":
        yy=section(p,"화면 목적",left,yy,lw,s["purpose"])
        yy=section(p,"진입 조건",left,yy,lw,s["entry"])
        yy=section(p,"캐릭터 배치",left,yy,lw,{"hero":"중앙 크게. 하단에 현재 대사와 필요한 정보.","compact":"상단으로 축소. 목록·답변 영역을 우선.","hidden":"설명·판단·제어가 우선. 캐릭터는 화면에서 잠시 제외.","voice":"작은 정적 표시·짧은 상태만. 말하고 듣는 경험은 음성으로, 시각 허용 범위에서만 표시."}[s["mode"]])
        if s["note"]:yy=section(p,"시연·범위 메모",left,yy,lw,s["note"])
        if yy>H-55:ERRORS.append((s["id"],"left annotation overflow",yy,H-55))
        p.text("화면 확대 / 구성·버튼의 상대적 배치",378,119,10,color=MUTED)
    if s["channel"]=="operator":
        # The operator uses a separate wide PC control layout.
        p.rect(40,143,690,456,stroke=INK,radius=3)
        p.text("O01 / 시연자 제어",60,160,18);p.marker(1,45,172)
        p.text("현재 회차 · 대상 요청 · 실제/모의 · 제한 상태",60,197,12)
        p.rect(60,229,650,58,fill=PALE,stroke=None)
        p.text(s["speech"],73,240,12,width=625,lineheight=18)
        p.marker(3,45,250)
        for i,c in enumerate(s["cards"]):
            yy2=304+i*67
            p.rect(60,yy2,650,57,stroke=LINE)
            p.text(c["title"],72,yy2+8,12,width=625)
            p.text(c["body"],72,yy2+29,10.5,width=625,lineheight=14,max_height=26)
            if i==0:p.marker(4,45,yy2+20)
        for i,a in enumerate(s["actions"]):
            xx=60+i*220
            p.rect(xx,528,210,48,fill="#E5E5E5",stroke=INK,radius=3)
            p.text(a["label"],xx+105,544,10.5,align="center")
            if i==0:p.marker(5,45,550)
        yy3=section(p,"목적·진입",40,625,690,s["purpose"]+" "+s["entry"])
        if s["note"]:section(p,"메모",40,yy3,690,s["note"])
    else:app(p,s)
    rx=762;rw=389
    p.text("요소 번호 / 동작 명세",rx,139,14)
    notes=[
        ("1  역할·상태",f"{s['speaker']} / {s['state']}"),
        ("2  캐릭터",{"hero":"현재 대화 주체를 크게 표시. 사용자 입력을 재촉하는 반복 움직임은 사용하지 않음.","compact":"한 명의 발화자만 상단에 축소해 출처를 유지.","hidden":"캐릭터를 숨겨 선택·경로 확인 정보가 읽히게 함.","voice":"시각 표시가 허용되면 작은 정적 캐릭터. 반복 움직임·긴 자막 없음."}[s["mode"]]),
        ("3  대사·조건",s["guard"]),
        ("4  정보·실패",s["failure"]),
    ]
    yy=170
    for label,body in notes:
        p.text(label,rx,yy,11.5);yy+=21
        yy+=p.text(body,rx,yy,10.7,width=rw,lineheight=16)+17
        p.line(rx,yy-8,rx+rw,yy-8)
    p.text("5  음성 명령 → 결과" if s["mode"]=="voice" else "5  버튼 → 결과",rx,yy,11.5);yy+=25
    for a in s["actions"]:
        target=f"WF-{a['target']:03d}"
        p.text(a["label"]+(" [조건 충족 후]" if not a["enabled"] else ""),rx,yy,10.7,width=rw,lineheight=16)
        yy+=len(wrap(a["label"]+(" [조건 충족 후]" if not a["enabled"] else ""),rw,10.7))*16+3
        yy+=p.text(f"{a['event']} → {target}",rx,yy,10,width=rw,lineheight=15,link=target)+12
    if yy>H-58:ERRORS.append((s["id"],"right annotation overflow",yy,H-58))
    p.text(f"피드백 예: {s['id']} / 요소 4 / 표시·문구·동작 중 수정할 점",40,776,10,color=MUTED)

def overview(pdf):
    p=Page("OV-01","설계의 중심: 내비를 유지하고 캐릭터가 행동을 연결",1,pdf)
    p.text(f"{len(SCREENS)}개 화면 · 기본 B / 요청 확장 E / 추가 O · 고유 번호 + 요소 번호로 피드백",40,109,14)
    context(p,60,155,690,"D")
    p.text("wayMate",790,165,28)
    yy=section(p,"내비와의 관계",790,220,350,"순정 내비는 시스템 앱 창. wayMate는 별도 앱 창 안에서 캐릭터·제안·확인·결과를 제공한다.")
    yy=section(p,"캐릭터의 역할",790,yy,350,"큰 내 친구 → 조건을 읽는 작은 친구 → 목록·경로 확인 → 결과를 알려주는 친구의 흐름.")
    yy=section(p,"이번 설계의 결과물",790,yy,350,"색·장식보다 화면 구조, 발화자, 동의, 내비 실행 경계, 실패와 제한 분기를 우선한 저해상도 설계도.")
    section(p,"검토 기준",60,565,690,f"Git docs 01~05 v0.6 + 06 협업 가이드 + 07 현재 구현. 기준 커밋 {BASE_COMMIT}. 담당자·마감 미정. 화면은 설계 결과이며 현재 앱의 기능 완료 현황은 07이 기준.")
    p.text("피드백: WF-019 / 요소 4 / 대기시간을 더 먼저 보여주세요.",60,718,16)
    p.finish()

    p=Page("OV-02","주차·제한·창 배치·내비 연동의 설계 결정",2,pdf)
    groups=[
        ("창 배치","대표 검토안은 순정 내비 + 우측 wayMate. S는 1:1, W는 2:1/1:2에 대응한다. 앱이 우측 고정·비율·내비 상시 표시를 강제할 수 있다고 가정하지 않는다.","P1 · P2"),
        ("법령과 플랫폼","내비 표시 예외를 대화·캐릭터·장소 선택의 포괄 허용으로 확대하지 않는다. 상세 조작은 안전한 주차 상태로 제한한다. 이 문서는 법적 적합성 인증이나 출시 심사 결과가 아니다.","L1 · P3 · P4"),
        ("정차와 주행","parked / driving_voice / blocked를 구분한다. 검증된 주행 음성은 핵심으로 유지하고 큰 캐릭터·목록·긴 자막·새 승인은 잠근다. 미검증·가림은 차단하며 속도 0만으로 주차를 열지 않는다.","P3 · P4 · P5"),
        ("내비 실행","선택지의 탐색은 경로 변경이 아니다. '경유지로 추가/목적지로 설정'을 명확히 확인한 뒤 요청한다. 사용자가 내비에 주소를 다시 입력하지 않게 연결하되 결과 콜백 전에는 성공시키지 않는다.","N1 · N2 · N3"),
        ("범위","기본 B는 01~05 흐름. E는 이번 요청의 개인 장소/일정 연동 시연으로 고정 질문·가상 장소를 사용한다. 기존 MEETING 전용 명령을 개인 추천에 우회 재사용하지 않는다.","docs 01~07"),
    ]
    y=135
    for a,b,c in groups:
        p.text(a,45,y,15);p.text(b,200,y,12,width=805,lineheight=20);p.text(c,1030,y,10,width=110,lineheight=17)
        y+=103;p.line(45,y-18,1145,y-18)
    p.text("공식 문서 확인: 2026-11-11. 실제 SDK·에뮬레이터·차종에서 창 배치와 지원 범위를 추가 검증한다.",45,710,12)
    p.finish()

    p=Page("OV-03","캐릭터 화면 모드와 주행 중 음성 대화",3,pdf)
    modes=[("H · 기본 홈","hero","큰 캐릭터\n현재 대사\n아래 일정·행동"),
           ("C · 선택·목록","compact","상단 작은 캐릭터\n조건·목록\n실행 전 확인"),
           ("F · 판단·확인","hidden","캐릭터 잠시 숨김\n공개·경로 확인\n승인과 취소"),
           ("V · 주행 음성","voice","작은 정적 표시\n짧은 발화 상태\n음성으로 쉬기·종료"),
           ("R · 사용 차단","hidden","지원 미확인·차단\n녹음·재생 중단\n플랫폼 가림 우선")]
    for i,(title,mode,body) in enumerate(modes):
        x=40+i*225
        p.text(title,x,135,16);p.rect(x,177,210,380,fill="#FAFAFA",stroke=INK)
        if mode=="hero":p.agent(x+42,210,126)
        elif mode in ["compact","voice"]:p.agent(x+14,192,45)
        p.text(body,x+15,350 if mode=="hero" else 270,13,width=180,lineheight=25)
        p.rect(x+15,497,180,40,fill="#E7E7E7",stroke=LINE)
        p.text("음성 제어" if mode=="voice" else "상태별 행동",x+105,509,11,align="center")
    section(p,"반응형·검증 기준",45,605,1080,"확대도는 앱 창의 논리 배치다. 넓고 낮은 창은 캐릭터/현재 정보와 선택 영역을 나란히 두고, 좁으면 캐릭터부터 줄인다. V는 실제 지원 검증이 필요한 목표 모드다. 현재 미검증 목업은 주차/발표용 대본으로 재현하고 실제 주행은 blocked를 유지한다.")
    p.finish()

    p=Page("OV-04","화면 흐름과 기본·확장·추가 범위",4,pdf)
    lanes=[
        ("모바일 준비","WF-001~005 → WF-006~009 → 차량", "공개 보류·요청 거절은 WF-010 → 본인 여행"),
        ("캐릭터와 알아가기","WF-011 → WF-012 ↔ WF-013~018", "콘텐츠를 모두 완료하지 않아도 WF-019 만남 제안"),
        ("만남·내비·결말","WF-019~023 → WF-027 → WF-028~031", "실패 WF-024 / 미확인 WF-025 / 취소·제거 WF-026"),
        ("차량 특화 E 확장","WF-012 → WF-034~039 / WF-044~045 → WF-046~050", "30분 휴식과 점심 요청을 분리. 개인 장소와 공유 만남의 승인·데이터도 분리"),
        ("공통·시연·추가","검증된 주행 음성 WF-051 / 차단 WF-032 / 복귀 WF-033", "운영 WF-040~041 · MC WF-042 · 후기 WF-043"),
    ]
    yy=145
    for a,b,c in lanes:
        p.text(a,48,yy,14);p.rect(250,yy-3,880,62,fill="#F4F4F4",stroke=None)
        p.text(b,270,yy+5,14,width=840);p.text(c,270,yy+31,11,color=MUTED,width=840)
        yy+=112
    p.finish()

    p=Page("OV-05","검토용 화면 목록 / 번호는 이후 수정에도 유지",5,pdf)
    rows=math.ceil(len(SCREENS)/2)
    for i,s in enumerate(SCREENS):
        col=i//rows;row=i%rows;x=45+col*560;y=133+row*24
        p.text(s["id"],x,y,11,link=s["id"],width=75)
        p.text(s["title"],x+88,y,10.8,width=385,link=s["id"])
        p.text(s["scope"],x+495,y,10,color=MUTED)
        p.line(x,y+22,x+520,y+22,color="#DDDDDD")
    p.finish()

def sources_page(pdf,page_no):
    p=Page("OV-06","근거·구현 의존사항·피드백 방법",page_no,pdf)
    y=135
    for code,title,url,summary in SOURCES:
        p.text(code,45,y,11)
        p.text(title,95,y,12,width=400,link=url)
        p.text(summary,520,y,10.7,width=620,lineheight=16)
        y+=47
    section(p,"구현 의존사항",45,665,1100,"E 확장은 개인 장소/일정 제안의 ID·승인·source/outcome·취소·중복 방지 계약이 필요하다. 04의 MEETING 전용 API를 그대로 실행하지 않는다. 07의 현재 지원 범위는 my_trip 전달까지이며 음성·순정 내비·분할 배치의 실제 동작 완료를 이 설계도로 대신하지 않는다.")
    p.finish()

INTRO = """# wayMate 목업 화면 설계서와 와이어프레임

작성일 2026년 11월 11일 · 버전 0.2 · 자유 입력·주행 음성 목표 반영

이 문서는 01~05 v0.6, 06 협업 가이드, 07 현재 구현 계약을 분석한 **목업 목표 화면의 시각 설계서**다. 기준 커밋은 `450c4fa`다. 실제 앱 구현 상태는 07을 따른다. 디자인 완성도보다 화면 구성·버튼 의미·상태 전환을 우선한다.

- [전체 화면 PDF](wireframes/v1/waymate-screen-spec-v0.2.pdf)
- [화면별 검토 뷰어](wireframes/v1/index.html): 저장소를 받은 뒤 브라우저에서 연다. GitHub 파일 화면에서는 HTML이 실행되지 않는다.
- 이전 PDF v0.1은 이력으로 보존한다. 현재 기준은 이 문서·v0.2 PDF·갱신된 SVG다.
- 피드백 형식: **WF-019 / 요소 4 / 대기시간을 더 먼저 보여주세요.** 화면 번호는 고정하고 삭제·추가 시 재번호를 붙이지 않는다.
- 담당자·마감은 미정이다. 이 설계는 기능·사용자·실제 주행·SDK 검증의 완료 기록이 아니다.

## 1. 문서 분석과 설계 판단

| 기준 | 화면에 반영한 판단 |
|---|---|
| 01 서비스 범위 | 자유 입력 온보딩과 이동 중 음성 대화 핵심을 유지. 원문·소개 확인·연결·동의 분리 |
| 02 시나리오 | A/B 대사 출처·사전 소개 조건·첫 만남 20분·두 결말 유지 |
| 03 상호작용 | 기존 WF 번호 유지. WF-002 자유 입력·예시 초안, WF-032 차단, 신규 WF-051 주행 음성 목표로 구분 |
| 04 연동 | 사용자 승인 → 요청 → 반영 확인. mock/real 출처와 처리 결과 분리. unknown에서 중복 요청 금지 |
| 05 검수 | Q 기능 검수와 V01~V05 가치/주행 검증 분리. 미정 담당·마감 유지 |
| 06 협업 | 앱 UI·차량 플랫폼·서버의 책임 경계 유지. 이 산출물은 문서·설계 자산만 추가 |
| 07 현재 구현 | my_trip 저장·HTTP 전달·ACK 기반 구현과 목표 화면을 구분. 전체 대화·내비 완료로 표시하지 않음 |

## 2. 목업 범위와 이번 요청의 확장

**B**는 기존 기본 목업, **E**는 이번 요청으로 설계한 차량 특화 확장 시연, **O**는 기존 추가 기능이다. B의 DM01~DM11 의미는 바꾸지 않는다.

E는 ‘30분 쉴 곳/점심 장소’의 준비된 질문, 가상 후보, 상세, 개인 경유지 또는 새 목적지 승인, 저장 일정 확인을 재현한다. 실시간 주변 검색·LLM·STT·자유 일정 분석·실제 영업 검증은 추가하지 않는다. E는 본인 여행 대안 프리셋이며 13:50의 B 만남 이야기와 자동으로 결합하지 않는다.

**자동 내비 반영**은 명확한 실행 버튼으로 승인한 뒤 순정 내비에 요청해, 사용자가 주소를 다시 입력하지 않아도 되는 흐름이다. 목록 열기·상세 선택·앱 진입만으로 경로를 바꾸지 않는다. 기존 D가 있으면 M 경유지 추가, D가 없으면 새 목적지 설정을 구분한다. 기존 경로가 바뀌면 다시 확인하고 무단 덮어쓰지 않는다.

공유 만남은 양쪽 동의와 별도 운전자 승인이 필요하다. 개인 장소는 본인의 명시적 승인이 필요하다. 개인 추천에 기존 MEETING 전용 NAV_APPROVE를 우회 사용하지 않는다. E의 데이터·명령·검수 계약은 구현 전에 01~05와 함께 갱신해야 한다.

| 내비 흐름 | 요청·결과 화면 | 종료·취소 의미 |
|---|---|---|
| 공유 만남 | WF-021 승인 → WF-022~025 | 만남 취소와 경유지 제거는 WF-026에서 구분 |
| 개인 휴식·식사·일정 | WF-037/038 승인 → WF-046 대기 → WF-047 경유지 또는 WF-048 새 목적지 | 실패 WF-049, 미확인 WF-050. B 연결·만남 취소 명령을 호출하지 않음 |

개인 안내의 요청 중 취소·반영 후 경로 복구는 이번 목업의 실행 범위에 넣지 않는다. 승인 전 취소만 제공하며 나머지는 후속 계약·검증 항목이다. 새 목적지 결과를 ‘M 경유 → 기존 D 유지’로 잘못 표시하지 않는다. 모든 개인 화면은 질문 종류·선택 장소·주소/좌표·동작·요청 ID를 유지한다. 뒤로 가기는 휴식 WF-036, 점심 WF-045, 저장 일정 WF-039 등 실제 진입 화면으로 돌아간다.

## 3. Pleos 배치와 주행 제한

대표 배치는 **드라이빙뷰(시스템) / 순정 내비 / 우측 wayMate 앱 창**이다. 창 비율과 위치는 플랫폼·사용자 설정에 따른다. 앱 내부에 순정 내비를 임베드하거나 상태바·GNB·차량 UI를 가짜로 구현하는 안이 아니다. 아래 차량 전체 그림은 배치 개념도다.

Connect-S의 1:1, Connect-W의 2:1/1:2, 앱 단독·가로/세로·앱 가림에 대응한다. 앱이 우측 고정이나 내비 상시 노출을 강제할 수 있다고 약속하지 않는다. 신규 앱 실행·딥링크로 배치가 바뀔 수 있어 실제 프로젝트에서 검증한다.

| 상태 | 화면·행동 기준 |
|---|---|
| 안전한 주차·실제 제한 없음 | 큰 캐릭터, 질문·목록·공개·동의·경로 변경 확인 제공 |
| driving_voice · 검증 조건 충족 | 상대 캐릭터와 음성 문답·쉬기·종료. 목록·키보드·긴 자막·큰 애니메이션·새 전송/동의/SDK 승인은 잠금 |
| blocked · 플랫폼 차단·지원 미검증·비활성·보고 만료 | 녹음·재생 중단. 현재 v2와 미검증 환경은 차단 유지. 운영자 전환으로 실제 제한 해제 금지 |
| 플랫폼이 앱을 가림 | 가림을 따르고 오버레이로 우회하지 않음. 순정 내비도 시스템 정책에 따름 |
| 주차·앱 복귀 | 최신 제한·상태 확인 뒤 현재 장면 복원. 전송·SDK·음성 자동 재실행 없음 |
| 내비 음성 안내 | 오디오 포커스 우선. 캐릭터 음성 중단/감쇄·수동 재개 |

주행 음성 목표는 핸즈프리 UI 지침을 근거로 검토하는 설계다. DO 선언·카테고리 심사·기능별 실제 제한·마이크/오디오·fresh 세션·foreground·실제 환경 증빙을 충족해야 하며 Boolean 제한 하나로 음성 전체를 허용/금지하지 않는다. 공식 API 문서는 있어도 프로젝트 안내의 STT/TTS는 준비 중으로 표시되어 콘솔·제공 SDK 검증이 필요하다. Gleo function 연동도 자유 캐릭터 대화의 자동 지원이 아니다. 실제 제공 조건은 04번 7.3절과 05번 V05가 기준이다.

법령의 지리안내 표시 예외를 캐릭터 대화·장소 목록 조작의 포괄 허용으로 확대하지 않는다. 상세 조작은 안전한 주차 상태로 제한하며 신호 대기·속도 0만으로 해제하지 않는다. DO·카테고리·지역·실제 제한·차종/버전 검증이 필요하고 이 문서로 법적 적합성이나 주행 지원을 인증하지 않는다.

## 4. 캐릭터·정보·행동의 공통 규칙

| 모드 | 구성 | 쓰는 상황 |
|---|---|---|
| H 큰 캐릭터 | 앱 창 중앙의 캐릭터·현재 발화, 아래 일정/바로가기 | 기본 홈·내 친구·상대 캐릭터·결말 |
| C 축소 | 발화자를 상단에 줄이고 조건·목록·답장을 우선 | 콘텐츠·장소 리스트·메시지 |
| F 숨김 | 캐릭터를 제외하고 정보·승인·취소만 명확히 표시 | 공개·경로 변경·불확실 결과 |
| V 주행 음성 | 작은 정적 표시·짧은 상태, 음성 문답·쉬기·종료 | 지원 검증이 필요한 기본 목표 WF-051 |
| R 사용 차단 | 최소 정적 안내 또는 플랫폼 가림, 녹음·재생 중단 | 플랫폼 차단·지원 미검증 WF-032 |

캐릭터는 기존 TravelFriend의 기하 형태를 회색조로 재사용한 구조 표시이며 최종 아트 확정이 아니다. 큰 캐릭터는 차량 전체 중앙이 아니라 **wayMate 앱 창 안의 중앙**이다. 목록에서는 상단 축소, 경로·동의 확인에서는 숨김으로 전환한다. 반복 애니메이션·게임·자동 화면 이동으로 시선을 끌지 않는다.

확대도는 세로 창의 논리 배치이며 실제 해상도·sp/dp 규격값이 아니다. 넓고 낮은 앱 창은 캐릭터/현재 정보와 선택 영역을 나란히 놓는다. 실제 구현은 03의 글자·터치 기준, 시스템 인셋·가림·실제 창 크기·글자 확대에서 재검수한다.

WF-002의 빈 자유 입력창이 기본이다. 예시 칩은 초안만 채우고 직접 수정·삭제하거나 예시 없이 전송할 수 있다. 원문 1~500 코드 포인트 검증·저장 실패/재시도·키보드 가림을 확인한다. 에이전트는 답변에 따라 필요한 후속 질문을 추가·변경한다. 예: 맛집 탐방 → 좋아하는 음식 종류. 목업은 준비된 분기로 재현하며 임의 답변의 AI 분석·질문 생성으로 설명하지 않는다. WF-003에서 원문과 소개값을 구분하고 확인하지 않은 소개값은 비워둔다. 원문은 상대·차량 전달본에 포함하지 않는다.

공통 요소 번호: **1 역할/상태, 2 캐릭터, 3 발화/조건, 4 필요한 정보·입력, 5 실행 버튼·음성 제어**. 숨김 모드는 2가 없는 것이 의도다. 준비·전송·동의·경로 반영 상태를 합치지 않는다.

## 5. 번호별 화면 목록

"""

def markdown():
    out=[INTRO,"| 번호 | 화면 | 범위 | 기존 화면·기능 |\n|---|---|---|---|"]
    for s in SCREENS:
        out.append(f"| [{s['id']}](#{s['id'].lower()}) | {s['title']} | {s['scope']} | {s['mapping']} · {s['dm']} |")
    out.append("\n## 6. 화면별 설계\n")
    for s in SCREENS:
        out += [
            f'<a id="{s["id"].lower()}"></a>\n',
            f'### {s["id"]}. {s["title"]}\n',
            f'![{s["id"]} {s["title"]}](wireframes/v1/pages/{s["id"]}.svg)\n',
            f'범위 {s["scope"]} · {s["mapping"]} · {s["scene"]} · {s["dm"]} · 담당자 미정 · 마감 미정\n',
            f'**목적:** {s["purpose"]}\n\n**진입:** {s["entry"]}\n',
            f'**조건:** {s["guard"]}\n\n**실패·분기:** {s["failure"]}\n',
            ('| 음성 명령 | 동작·조건 | 다음 번호 |\n|---|---|---|' if s["mode"]=="voice" else '| 버튼 | 동작·조건 | 다음 번호 |\n|---|---|---|'),
        ]
        for a in s["actions"]:
            out.append(f'| {a["label"]}{" (조건 충족 후)" if not a["enabled"] else ""} | {a["event"]} | WF-{a["target"]:03d} |')
        if s["note"]:out.append("\n**메모:** "+s["note"]+"\n")
        out.append("")
    out += [
        "## 7. 구현·검수와 피드백\n",
        f"{len(SCREENS)}개 WF는 화면 설계 단위이며 모두 별도 Android Activity라는 뜻은 아니다. 기존 P01~P04 안의 상태를 재사용한다. 앱 코드·공통 API·실제 내비 구현을 이 산출물로 변경하지 않는다.\n",
        "- 기본 B: 05의 Q와 연결·공개·선택형 콘텐츠·두 결말·취소/정리·모의 결과·finalRound 규칙 대조.",
        "- E 확장: 개인 제안의 식별자·승인·설정/경유지 구분·중복·실패/unknown·취소·현재 경로 변경 감지를 별도 계약으로 확정.",
        "- V01~V05: 캐릭터 효과·동행감·상대 응답 시점·총 시간 부담·실제 주행 실현성 검증. 목업을 클릭했다는 이유로 통과 처리하지 않음.",
        "- Connect-S/W·좁은 창·가로·앱 가림·글자 확대에서 잘림, 초점, 읽기·실행 영역 확인.",
        "- 자유 입력: 예시 없는 입력·초안 수정·이모지/줄바꿈·500자 경계·실패/재시도·원문 비공개·미확인 소개값·v2 거부/목표 v3 전환 검수.\n",
        "- 주행 음성: parked/driving_voice/blocked·실제 지원 증빙·마이크/포커스/제한·음성 종료·자동 재개 방지를 V05에서 검증.\n",
        "- 모든 담당자·마감·추가 실제 검증 결과는 미정/미실시 유지.\n",
        "| 피드백 번호 | 요소 | 관찰한 문제 | 원하는 변경 | 담당자 | 마감 |\n|---|---|---|---|---|---|",
        "| WF-___ | 1~5 | 작성 | 작성 | 미정 | 미정 |\n",
        "## 8. 공식 근거와 확인 범위\n",
        "확인일 2026-11-11. 공식 API가 있다는 사실과 이 프로젝트에서 실행·권한·SDK가 검증됐다는 사실은 구분한다. 아래 요약은 설계 기준이며 실제 법적 판단·앱 심사·차종별 지원 확인을 대신하지 않는다.\n",
    ]
    for code,title,url,summary in SOURCES:out.append(f"- **{code} [{title}]({url})**: {summary}")
    out.append("\n## 9. 재생성\n\n원본은 [spec.py](wireframes/v1/source/spec.py), 렌더러는 [build.py](wireframes/v1/source/build.py)다. ReportLab과 한국어 TrueType 폰트가 있는 Python에서 build.py를 실행하면 PDF·SVG·목록을 같은 데이터로 만든다. PDF와 각 SVG의 화면 번호·내용을 함께 수정한다.\n")
    (DOCS/"08_목업_화면_설계서_및_와이어프레임.md").write_text("\n".join(out).rstrip()+"\n")

def viewer():
    data=json.dumps([{k:s[k] for k in ["id","title","channel","scope"]} for s in SCREENS],ensure_ascii=False)
    tpl="""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>wayMate 화면 설계 검토 v0.2</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Apple SD Gothic Neo',sans-serif;color:#222;background:#eee}
header{position:sticky;top:0;background:white;border-bottom:1px solid #bbb;padding:16px 24px;z-index:2}
h1{font-size:19px;margin:0 0 10px}nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
select,input,button,a{font:inherit}select,input,button{padding:8px;border:1px solid #888;border-radius:3px;background:white}
a{color:#222}main{max-width:1440px;margin:auto;padding:20px}
figure{margin:0 0 26px;background:white;scroll-margin-top:calc(var(--head-height,180px) + 20px)}figure img{display:block;width:100%;height:auto}
figcaption{padding:12px 18px;border-top:1px solid #ddd;font-size:14px}
aside{font-size:13px;color:#555;margin:12px 0 0}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #555;outline-offset:3px}
@media print{header{position:static}figure{break-after:page;margin:0}main{padding:0}aside{display:none}}
</style></head><body>
<header><h1>wayMate 목업 화면 설계서 · __COUNT__개 화면</h1>
<nav><label>구간 <select id="group"><option value="all">전체</option><option value="mobile">모바일</option><option value="car">차량</option><option value="operator">시연자</option><option value="E">확장 E</option></select></label>
<label>번호·제목 <input id="query" type="search" placeholder="WF-019 또는 장소" aria-label="화면 번호 또는 제목 검색"></label>
<label>화면 <select id="jump" aria-label="화면 선택"></select></label>
<a href="waymate-screen-spec-v0.2.pdf">전체 PDF</a><a href="../../08_목업_화면_설계서_및_와이어프레임.md">상세 명세 MD</a></nav>
<aside>피드백 예: WF-019 / 요소 4 / 대기시간을 더 먼저 보여주세요. B 기본 · E 요청 확장 · O 추가. 도식은 실제 앱·순정 내비 화면이 아닙니다.</aside>
</header><main id="book"></main><script>
const screens=__DATA__;
const book=document.getElementById('book'),group=document.getElementById('group'),query=document.getElementById('query'),jump=document.getElementById('jump');
new ResizeObserver(()=>document.documentElement.style.setProperty('--head-height',document.querySelector('header').getBoundingClientRect().height+'px')).observe(document.querySelector('header'));
for(const s of screens){const o=document.createElement('option');o.value=s.id;o.textContent=s.id+' '+s.title;jump.append(o);}
function render(){book.replaceChildren();const q=query.value.toLowerCase().trim();let count=0;
 for(const s of screens){if(group.value!=='all'&&s.channel!==group.value&&s.scope!==group.value)continue;if(q&&!(s.id+' '+s.title).toLowerCase().includes(q))continue;
 const f=document.createElement('figure');f.id=s.id;const im=document.createElement('img');im.src='pages/'+s.id+'.svg';im.alt=s.id+' '+s.title;im.width=1191;im.height=842;im.loading='lazy';
 const c=document.createElement('figcaption');c.textContent=s.id+' · '+s.title+' · '+s.scope+' | 피드백: 화면 번호 / 요소 1~5 / 문제와 변경안';f.append(im,c);book.append(f);count++;}
 if(!count){const p=document.createElement('p');p.textContent='일치하는 화면이 없습니다.';book.append(p);}}
group.addEventListener('change',render);query.addEventListener('input',render);jump.addEventListener('change',()=>{group.value='all';query.value='';render();location.hash=jump.value;document.getElementById(jump.value)?.scrollIntoView({behavior:'instant',block:'start'});});
render();if(location.hash){const id=location.hash.slice(1);if(screens.some(s=>s.id===id)){jump.value=id;requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView());}}
</script></body></html>
"""
    (ROOT/"index.html").write_text(tpl.replace("__DATA__",data).replace("__COUNT__",str(len(SCREENS))))

def main():
    ROOT.mkdir(parents=True,exist_ok=True);(ROOT/"pages").mkdir(exist_ok=True)
    pdf=canvas.Canvas(str(ROOT/"waymate-screen-spec-v0.2.pdf"),pagesize=(W,H),pageCompression=1)
    pdf.setTitle("wayMate 목업 화면 설계서 v0.2")
    pdf.setAuthor("wayMate")
    overview(pdf)
    for i,s in enumerate(SCREENS,6):
        p=Page(s["id"],s["id"]+"  "+s["title"],i,pdf);screenpage(p,s);p.finish()
    pages=6+len(SCREENS)
    sources_page(pdf,pages)
    pdf.save()
    markdown();viewer()
    (ROOT/"screens.json").write_text(json.dumps({"version":VERSION,"date":DATE,"baseCommit":BASE_COMMIT,"screens":SCREENS},ensure_ascii=False,indent=2)+"\n")
    (ROOT/"layout-check.json").write_text(json.dumps({"overflow":ERRORS,"pages":pages,"screens":len(SCREENS)},ensure_ascii=False,indent=2)+"\n")
    if ERRORS:
        print(json.dumps(ERRORS,ensure_ascii=False,indent=2));sys.exit(1)
    print(f"Generated {len(SCREENS)} screen SVGs, 6 overview SVGs, {pages}-page PDF, Markdown, review viewer.")

if __name__=="__main__":main()
