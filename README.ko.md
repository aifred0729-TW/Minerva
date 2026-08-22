<p align="center">
  <img src="docs/banner.jpg" alt="Minerva - Next-Generation Mythic C2 Interface" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | 한국어
</p>

<p align="center">
  <strong>Next-Generation Mythic C2 Interface</strong><br>
  숙련된 레드팀 Operator를 위해 설계된 사이버펑크 스타일의 실시간 협업 Command &amp; Control 인터페이스
</p>

<p align="center">
  <img src="https://img.shields.io/badge/minerva-2.2.1-22C55E?style=flat-square" alt="Minerva Version">
  <img src="https://img.shields.io/badge/mythic-0.3.106-lightgrey?style=flat-square" alt="Mythic Compatibility">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/react-19.2-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.9%2B-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/three.js-0.183-black?style=flat-square&logo=three.js" alt="Three.js">
  <img src="https://img.shields.io/badge/apollo-4.1-311C87?style=flat-square&logo=apollographql" alt="Apollo">
</p>

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Minerva Dashboard" width="100%">
</p>

---

## 목차

- [개요](#개요)
- [Screenshots](#screenshots)
  - [★ 3D Cyber-Topology](#topology3d)
- [기능 목록](#기능-목록)
- [Application Map](#application-map)
- [Tech Stack](#tech-stack)
- [Quick Start（Production）](#quick-startproduction)
- [Development Mode（Hot Reload）](#development-modehot-reload)
- [데스크톱 앱（Windows / macOS）](#데스크톱-앱windows--macos)
- [Metasploit Integration](#metasploit-integration)
- [Setup Script（`minerva_install.sh`）](#setup-scriptminerva_installsh)
- [Mythic 소스 패치（`mythic_change.sh`）](#mythic-소스-패치mythic_changesh)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Routing &amp; Sidebar](#routing--sidebar)
- [Nginx Proxy Layout](#nginx-proxy-layout)
- [Theme System](#theme-system)
- [Battle Mode](#battle-mode)
- [Audio System](#audio-system)
- [Custom Graph Nodes](#custom-graph-nodes)
- [Authentication &amp; Sessions](#authentication--sessions)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## 개요

<p align="center">
  <img src="docs/screenshots/login.png" alt="Minerva Login" width="100%">
</p>

**Minerva**는 [Mythic C2 Framework](https://github.com/its-a-feature/Mythic)를 위한 현대적인 사이버펑크 스타일 웹 인터페이스입니다. Mythic과 **나란히 동작하는 독립 스택**으로 실행됩니다 — Mythic에 내장된 `MythicReactUI`를 대체하는 것이 아니라, 그 옆에 서는 또 하나의 프론트엔드입니다. 장기 레드팀 작전을 수행하며 정보 밀도가 높고 조작 마찰이 적은 콘솔이 필요한 Operator를 위해 처음부터 설계되었습니다.

기본 UI에 Minerva가 더하는 것:

- **3D Cyber-Topology** — 대표 뷰입니다. 작전 전체를 Three.js로 그린 살아 있는 지도로 보여줍니다. 서브넷은 반투명 볼륨으로, C2와 P2P 링크는 색으로 구분되며, 노드별 **QUICKHACK**과 **DOSSIER** 패널은 장면을 벗어나지 않고 그 위에서 열립니다. 자세한 내용은 [아래 투어](#topology3d)를 참고하십시오.
- **실시간 협업 그래프** — ReactFlow 기반 Callback 토폴로지. Relay／Proxy 인프라를 표현하는 공유 Custom Node를 지원하며, Hasura를 통해 접속 중인 모든 Operator에게 5초마다 동기화됩니다.
- **고기능 Interactive Console** — 구조화된 출력 블록, Mimikatz 파싱, 프로세스 목록 렌더링, File Browser 오버레이, 드래그&드롭 업로드, 인라인 Tasking 폼을 갖춘 멀티탭 터미널.
- **Quick Hack 워크플로** — Callback에 원클릭으로 적용하는 정형 레드팀 워크플로(recon／persistence／dumping／lateral movement)를 Tasking 매크로로 연결합니다.
- **네이티브 Metasploit 통합** — Launch Dashboard, Session 수명주기 관리, 영속적인 실행 이력, 실시간 Task Browser 출력 파싱을 갖춘 MSF-RPC 클라이언트.
- **MITRE ATT&amp;CK 매트릭스** — Task／Command／Tag 오버레이를 겹친 완전한 T-id 매트릭스로 Technique 커버리지를 실시간으로 확인할 수 있습니다.
- **Eventing 워크플로** — Keyword Trigger와 조건 분기 단계를 갖춘 Mythic eventing 인스턴스의 시각적 빌더.
- **Battle Mode** — 전술 UI 모드(Combat／Recon／Normal). 밀도, 애니메이션 속도, 배경음을 작전 상황에 맞게 재조정합니다.
- **테마와 오디오** — CSS 변수 기반 다크／라이트 테마, 사용자 지정 배경 이미지, JetBrains Mono／Inter 타이포그래피, IndexedDB 기반 음악 라이브러리, 이벤트별 SFX.

### 배포 형태

Minerva는 **Mythic과 완전히 분리된 자체 Docker 스택**으로 동작합니다 — Mythic의 `MythicReactUI` 디렉터리에 복사되지도, `mythic_react` 컨테이너에 포함되지도 않습니다. `scripts/minerva_install.sh`(또는 `docker compose up -d`)가 두 개의 컨테이너를 띄웁니다. `minerva-dev`(Mythic이 자체 UI를 제공하는 것과 동일하게 `react-app-rewired`가 React 앱을 서빙)와, 그 앞단의 `minerva` Nginx 컨테이너입니다. 후자는 **443**에서 TLS를 종료하고 `/graphql`, `/auth`, `/refresh`, `/msf-rpc`, `/direct`를 `host.docker.internal`을 통해 기존 Mythic 인스턴스로 리버스 프록시합니다. 최초 실행 시 자체 서명 인증서를 생성하며, Mythic 자체 UI는 전혀 건드리지 않습니다.

`minerva_install.sh`는 순정 Mythic에 필요한 일회성 백엔드 준비 작업도 수행합니다. `.env` 설정, 필수 Go 패치 적용(`mythic_change.sh`), Hasura 구성이 그것입니다. 이 작업들이 건드리는 것은 Mythic의 **백엔드뿐**이며, Minerva 자체는 항상 자기 컨테이너 안에 머무릅니다.

> **컨테이너 간 도달성(`.env`):** `minerva` 컨테이너는 Mythic의 docker network에 있지 않으므로 호스트 게이트웨이(`host.docker.internal`)를 통해 Mythic에 접근합니다. 이것이 동작하려면 Mythic이 포트를 loopback뿐 아니라 모든 인터페이스에 공개해야 합니다 — 따라서 Mythic의 `.env`에서 `NGINX_BIND_LOCALHOST_ONLY`(포트 7443)와 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY`(C2 포트 7000-7010)는 **반드시 `"false"`**여야 합니다. `minerva_install.sh`가 이를 자동으로, 그리고 멱등하게 설정합니다. 수동으로 설치한다면 직접 설정한 뒤 `./mythic-cli start`로 다시 바인딩하십시오. 이 값을 `"true"`로 두는 것이 신규 설치가 connection refused로 실패하는 가장 흔한 원인입니다.

---

## Screenshots

### 1 · Authentication

#### Login

사이버펑크 스타일의 인증 화면. 실시간 서버 상태 모니터링, HTTPS 암호화 표시기, Session State 추적기를 갖추고 있습니다.

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="100%">
</p>

### 2 · Command &amp; Control

#### Dashboard

작전 전체의 개관 — Active Callbacks, Total Payloads, C2 인프라 상태, T- / T-0 / T+ 작전 타임라인이 포함된 Operation 상세, Command 통계, 자산 수집 지표, Top Commands, 최근 활동 피드. 패널 레이아웃은 깊이 제한이 없는 분할 트리로, 어떤 패널이든 수평·수직으로 나눌 수 있으며 그 배치는 Operator별로 저장됩니다.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

<a id="topology3d"></a>

#### 3D Cyber-Topology &nbsp;·&nbsp; ★ 대표 기능

> **Minerva는 이 뷰를 중심으로 만들어졌습니다.** Dashboard가 숫자로 세는 것을, Topology는 있어야 할 자리에 그대로 그립니다 — 어떤 호스트를 장악했는지, 트래픽이 실제로 어떻게 도달하는지, 그리고 다음 홉과의 사이에 무엇이 가로막고 있는지.

자유로운 Orbit 조작이 가능한 완전한 Three.js 장면입니다. 머신은 물리 레이아웃으로 배치되고 **Network Space** 단위로 묶입니다 — CIDR마다 하나의 반투명 볼륨이 있고, 서브넷과 노드 수가 라벨로 표시됩니다. 링크 종류는 추측이 아니라 색이 알려줍니다. 직결 **C2**는 시안, **P2P** 릴레이 체인은 마젠타이며, 각 엣지에는 전송 방식(`http`, `tcp`)이 표기됩니다. Tunnel 레이어는 진행 중인 SOCKS／RPORTFWD 체인을 같은 그래프 위에 겹쳐 보여줍니다.

노드 색은 곧 상태입니다. **CORE**(Minerva 서버 자신), **ALIVE**, **HIGH PRIV**, **DEAD**, 그리고 Operator가 정의한 **CUSTOM** 릴레이 노드. 하단 상태 표시줄은 머신 수, Callback 수, 생존／사망 Session 수, Custom Node 수, 엣지 수, 네트워크 수를 실시간으로 집계합니다. Network Space는 CIDR 단위로 숨길 수 있어 지금 작업 중인 세그먼트만 남길 수 있으며, 숨김 목록은 새로고침 후에도 유지되고 장면 메뉴의 **HIDDEN SPACES** 그룹에서 복원할 수 있습니다.

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

노드를 우클릭하면 동작 메뉴가 열립니다 — 각 행은 테두리가 있는 컨트롤이고, 상태는 오른쪽 칩이 담당하며(`LOCKED`, `ON`, `ARMED`), 파괴적인 행은 실행 전에 한 번 arm 상태를 거칩니다. 그중 두 행은 **장면을 벗어나지 않은 채** 뷰포트를 넘겨받는데, 아래 스크린샷이 포착한 것이 바로 그 장면입니다:

- **QUICKHACK** — 공격 패널이 노드 옆에 도킹됩니다(`HARVEST`, `RPFWD`, `SOCKS`, `DISCONNECT`, `AMPLIFICATION`). 대상 Agent가 실행할 수 없는 hack은 흐리게 처리되고 `N/A` 칩이 붙으며, 나머지는 실행에 필요한 파라미터 수(`1 VAR`, `3 VARS`)를 표시합니다. 푸터는 arm된 대상을 추적합니다.
- **VIEW DETAILS** — 노드 도시에(dossier). 왼쪽에는 해당 머신의 기록 — identity, platform, network, link가 `//SECTION` 헤더별로 정리됩니다. 오른쪽은 **DEFENCE MATRIX**로, 해당 호스트의 모든 Session과 함께 "이 장비를 건드려도 되는가"를 결정하는 세 가지 상태를 나열합니다. **안티바이러스／EDR**, **방화벽**, **권한**입니다. AV와 방화벽은 Operator가 직접 표시하는 값이며(Mythic은 둘 다 보고하지 않습니다) Operator의 Preferences를 통해 호스트별로 유지됩니다. 권한은 Session에서 실시간으로 도출되며 플랫폼에 따라 다르게 표시됩니다 — Linux／macOS는 `ROOT`, Windows는 `SYSTEM`／`ADMIN`.

두 패널 모두 모달이 아니라 도킹형입니다. 뒤에서 Topology는 계속 갱신되며, `ESC` 또는 **EXIT INTERFACE**를 누르기 전까지 닫히지 않습니다.

<p align="center">
  <img src="docs/screenshots/topology3d-details.png" alt="Quickhack panel, node dossier and defence matrix over the live scene" width="100%">
</p>

#### Event Feed

경고 카운터가 있는 실시간 이벤트 스트림. 사이드바 알림 벨과 연동되어 새 Callback, Alert, Custom Event, Feedback, Startup 이벤트를 발생 즉시 보여줍니다.

<p align="center">
  <img src="docs/screenshots/events.png" alt="Event Feed" width="100%">
</p>

#### Operations Manager

Operation 수명주기 관리. 상태 추적(Active／Complete／Deleted), Operator 배정, Operation별 OPSEC Command Blocklist를 제공합니다.

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

#### OPSEC

Operation 단위 OPSEC 제어 — Command Blocklist, 역할 기반 게이트, Tasking 시점의 강제 적용.

<p align="center">
  <img src="docs/screenshots/opsec.png" alt="OPSEC" width="100%">
</p>

### 3 · Callbacks &amp; Tasking

#### Active Callbacks

Minerva Core 노드와 활성 Agent의 연결 관계를 보여주는 ReactFlow 그래프 뷰. 공유 Custom Node가 Relay／Proxy 인프라를 표현합니다. 아래의 정렬 가능한 데이터 테이블은 일괄 작업, Sleep／Jitter 편집, 그룹화, Last-Checkin 배지를 지원합니다.

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

#### Console Selection

다중 Callback Interactive Console의 탭 선택기. 이전에 열었던 모든 탭을 표시하여 맥락을 잃지 않고 Callback 사이를 오갈 수 있습니다.

<p align="center">
  <img src="docs/screenshots/console-selection.png" alt="Console Selection" width="100%">
</p>

#### Interactive Console

구조화된 출력 블록을 갖춘 명령 Tasking — Mimikatz 파싱, 프로세스 목록, File Browser 오버레이, 인라인 Tasking 폼, 드래그&드롭 업로드, 실시간 스트리밍 Task 블록.

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

#### Tasks

단일 Task 상세 뷰. 전체 Host Tree, 파라미터 인스펙터, 구조화된 출력 뷰어, 이전／다음 Task 이동을 제공합니다.

<p align="center">
  <img src="docs/screenshots/tasks.png" alt="Tasks" width="100%">
</p>

### 4 · Payloads

#### Payloads Overview

Payload 목록, 다단계 Create-Payload 마법사, Wrapper 흐름의 허브. Payload 설정의 가져오기／내보내기와 기존 Payload로부터의 재빌드를 지원합니다.

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

#### Create Payload Wizard

단계별 빌드 파이프라인: OS &rarr; type &rarr; commands &rarr; C2 &rarr; build. 각 단계가 상태를 유지하므로 진행 상황을 잃지 않고 이전 단계로 돌아가 조정할 수 있습니다.

<p align="center">
  <img src="docs/screenshots/create-payload.png" alt="Create Payload" width="100%">
</p>

#### Payload Types

설치된 모든 Agent／Wrapper／Translator／Consuming Service／Custom Browser를 한눈에 보는 뷰. 헤더 툴바는 **검색**, **정렬(이름／상태／명령 수)**, **온라인만** 필터, **삭제됨 표시** 토글을 제공합니다. 각 카드에는 Agent의 SVG 아이콘, 컨테이너 상태, Build Parameter 인스펙터, Command Browser, 컨테이너 파일 편집기, Webhook／Logger 이벤트의 원클릭 테스트가 포함됩니다.

<p align="center">
  <img src="docs/screenshots/payload-types.png" alt="Payload Types" width="100%">
</p>

### 5 · Infrastructure

#### C2 Profiles

C2 통신 프로파일 관리. 설치된 모든 프로파일(discord, dns, github, http, https, tcp, websocket)을 버전 정보, 상태 표시기, 컨테이너 파일 목록／편집, 시작·중지 컨트롤과 함께 보여줍니다.

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

#### Tunnel Manager

Tunnel 관리. Operator 측 Proxy, C2 서버 릴레이, 대상 측 엔드포인트를 보여주는 시각적 흐름도를 제공하며, 활성 Tunnel 상태와 포트 매핑, 전체 연결 체인을 표시합니다.

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

### 6 · Files, Credentials &amp; Intel

#### File Manager

중앙 집중식 파일 관리. Downloads, Uploads, Screenshots, Eventing 워크플로 파일로 분류된 사이드바를 제공하며 대상 머신의 File Browser 트리도 포함합니다.

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

#### Credentials Vault

자격 증명 저장소. 다중 필드 검색(Account, Realm, Credential, Comment, Tag)을 지원하고 검증된 항목과 수집된 항목의 수를 추적하며, 각 자격 증명을 출처 Task와 연결합니다.

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

#### Artifacts

IoC／Artifact 뷰어. Task 연결과 호스트 귀속 정보를 함께 제공합니다.

<p align="center">
  <img src="docs/screenshots/artifacts.png" alt="Artifacts" width="100%">
</p>

#### Search

Task, File, Credential, Callback, Artifact를 아우르는 전역 검색. 고급 필터링을 지원하며 모든 질의는 현재 Operation으로 범위가 한정됩니다.

<p align="center">
  <img src="docs/screenshots/search.png" alt="Global Search" width="100%">
</p>

### 7 · Automation &amp; Frameworks

#### Quick Hacks

원클릭 레드팀 워크플로 라이브러리(recon／persistence／dumping／lateral). 선택한 Callback들에 명령을 연쇄 실행합니다. 워크플로는 JSON으로 정의되어 Operator가 확장할 수 있으며, Topology의 노드별 **QUICKHACK** 패널도 같은 라이브러리로 동작합니다.

<p align="center">
  <img src="docs/screenshots/quickhacks.png" alt="Quick Hacks" width="100%">
</p>

#### Metasploit

네이티브 MSF-RPC 클라이언트. 탭은 **Dashboard**(Session／Job／Module), **Launch Attack**(Module Browser + 파라미터 폼), **Operations**(활성 Session, Job, Route), **Task History**(전체 출력을 포함한 영속 실행 이력)로 구성됩니다.

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit" width="100%">
</p>

#### Eventing

Mythic eventing을 위한 시각적 워크플로 빌더 — Event Group, Instance, Keyword Trigger, 조건 분기 단계, 그리고 조건에 일치하는 이벤트의 실시간 스트림.

<p align="center">
  <img src="docs/screenshots/eventing.png" alt="Eventing" width="100%">
</p>

### 8 · Intel &amp; MITRE

#### MITRE ATT&amp;CK

모든 전술 범주에 걸쳐 637개 Technique을 매핑한 완전한 MITRE ATT&amp;CK 매트릭스 시각화. Tasks, Tasks/PT, Commands, Tags로 필터링할 수 있으며 셀이 켜지면서 실제 실행 커버리지를 보여줍니다.

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### 9 · Admin &amp; Customization

#### Users

Operator 관리: 생성, 편집, 비활성화, 비밀번호 변경, Admin 역할 전환.

<p align="center">
  <img src="docs/screenshots/users.png" alt="Users" width="100%">
</p>

#### Reporting

Operation 데이터를 기반으로 하는 리포트 빌더. 분석, 필터, 내보내기 옵션을 제공합니다.

<p align="center">
  <img src="docs/screenshots/reporting.png" alt="Reporting" width="100%">
</p>

#### Browser Scripts

편집 가능한 Browser Script 라이브러리. 가상화 테이블, 정렬 가능한 열, `tabs` 렌더링, Payload Type별 범위 지정을 지원합니다.

<p align="center">
  <img src="docs/screenshots/browser-scripts.png" alt="Browser Scripts" width="100%">
</p>

#### Tags

모든 엔티티를 아우르는 태그 기반 정리와 필터링.

<p align="center">
  <img src="docs/screenshots/tags.png" alt="Tags" width="100%">
</p>

#### Settings

포괄적인 환경설정 패널. Operator Preferences, 표시 토글, 타임스탬프 형식, Task 상호작용 모드, Browser Script 옵션, 오디오／음악 라이브러리, 테마 팔레트, 사이드바 단축 항목 순서를 다룹니다.

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## 기능 목록

### Visualization

| 기능 | 설명 |
|------|------|
| **3D Topology** &nbsp;★ | Three.js 기반 3D 네트워크 지도 — Orbit 조작, CIDR Network Space의 반투명 볼륨(숨김 가능·유지), 물리 배치, C2／P2P를 색으로 구분한 엣지, Tunnel 레이어, 실시간 상태 표시줄, 노드 우클릭 메뉴, 장면 내 **QUICKHACK** 패널과 **노드 도시에 + DEFENCE MATRIX** |
| **Callback Graph** | ReactFlow 기반 인터랙티브 2D 그래프. ELK 자동 레이아웃, Custom Node 생성, 엣지 관리, PNG 내보내기, Graph Config 패널을 제공 |
| **Custom Nodes** | Operator가 정의하는 Relay／Proxy 노드. Hasura `agentstorage`에 서버 측 저장되어 접속 중인 모든 Operator에게 5초마다 동기화 |
| **MITRE ATT&amp;CK** | Technique 매핑, 실행 추적, Task／Command／Tag 오버레이를 갖춘 완전한 ATT&amp;CK 매트릭스 |
| **Tunnel Map** | 부모-자식 Tunnel 관계, 포트 매핑, 실시간 상태를 보여주는 사이버펑크 스타일 흐름도 |

### Core Operations

| 기능 | 설명 |
|------|------|
| **Dashboard** | T- / T-0 / T+ 작전 타임라인과 Operator별로 유지되는 깊이 무제한 분할 트리 레이아웃을 갖춘 작전 개관 |
| **Callbacks** | 실시간 Callback 추적. 상태 표시기(alive／dead／streaming), 일괄 작업, 그룹화, Last-Checkin 배지, Sleep／Jitter 편집 지원 |
| **Console** | 멀티탭 인터랙티브 Tasking. 구문 강조 출력 블록, 분할 뷰 DB 출력, 명령 이력, autoScroll 토글, 드래그&드롭 업로드, 스트리밍 Task 결과 |
| **Tasks** | 단일 Task 전용 뷰. 전체 Host Tree, 파라미터 인스펙터, 출력 뷰어, Task 단위 이동 |
| **Payloads** | 다단계 Create-Payload 마법사(OS &rarr; type &rarr; commands &rarr; C2 &rarr; build), Wrapper 흐름, Payload 가져오기／내보내기, 기존 항목 재빌드, Browser Script `tabs` 출력에 대한 탭 상한 |
| **Files** | 다운로드／업로드 추적, 썸네일 그리드가 있는 스크린샷 뷰어, Keylog 검색, 모달 드래그&드롭 업로드, Artifact 정리 |
| **Credentials** | 중복 제거, 해시 관리, 계정 연결, 다중 필드 검색을 갖춘 Vault |
| **Search** | Task, File, Credential, Callback, Artifact를 아우르는 전역 검색 — 현재 Operation으로 범위 한정 |
| **Artifacts** | Task 연결을 갖춘 IoC／Artifact 뷰어 |
| **Tags** | 모든 엔티티를 아우르는 태그 기반 정리와 필터링 |

### Advanced

| 기능 | 설명 |
|------|------|
| **Battle Mode** | Combat／Recon／Normal 모드 전환과 전술 UI 최적화(Combat에서 애니메이션 2배속, Recon에서 비핵심 정보 흐리게) |
| **Eventing** | Mythic eventing을 위한 시각적 워크플로 빌더 — Event Group, Instance, Keyword Trigger, 조건 분기 단계, 일치 이벤트의 실시간 스트림 |
| **Quick Hack** | 원클릭 레드팀 워크플로 라이브러리(recon／persistence／dumping／lateral). 선택한 Callback에 명령을 연쇄 실행하며 Topology의 노드별 공격 패널도 구동 |
| **Metasploit** | Launch Dashboard, Session 목록, Job 제어, 자격 증명 저장, 영속 실행 이력을 갖춘 네이티브 MSF-RPC 클라이언트 |
| **Operations** | 역할 기반 접근 제어와 Operation별 OPSEC Command Blocklist를 갖춘 수명주기 관리 |
| **Reporting** | Operation 데이터로부터 리포트 생성 및 분석 |
| **C2 Profiles** | 프로파일 설정, 컨테이너 파일 목록／편집, 시작·중지 제어 |
| **PayloadTypes** | 설치된 모든 Agent／Wrapper／Translator／Consuming Service／Custom Browser를 실시간 상태, Build Parameter 인스펙터, Command Browser, 컨테이너 파일 편집기, Webhook／Logger 이벤트 원클릭 테스트와 함께 한눈에 표시 |
| **Browser Scripts** | 가상화 테이블, 정렬 가능한 열, `tabs` 렌더링, PT별 범위 지정을 갖춘 편집 가능한 Browser Script 라이브러리 |
| **Audio System** | 전역 음악 플레이어(IndexedDB 기반 라이브러리), 이벤트별 사운드 이펙트(Callback, Tunnel, 인증, 오류), SFX 개별 토글 |
| **Theme &amp; Palette** | 다크／라이트 테마, 사용자 지정 액센트 색상, 사용자 지정 배경 이미지, JetBrains Mono／Inter 타이포그래피 |

---

## Application Map

UI 전체는 `/new/...` 아래에 마운트됩니다(기본 `mythic_react`와 공존할 수 있도록). 라우트 목록:

| 경로 | 페이지 | 용도 |
|------|--------|------|
| `/new/login` | `Login` | JWT 인증 + 서버 상태／SSL 표시기 |
| `/new/invite` | `Invite` | Operator 초대 링크 등록 |
| `/new/dashboard` | `Dashboard` | 작전 개관과 활동 피드 |
| `/new/topology` | `Topology3D` | **3D 네트워크 지도**(대표 기능) |
| `/new/events` | `EventFeed` | 경고 카운터가 있는 실시간 이벤트 스트림 |
| `/new/callbacks` | `Callbacks` | Active Callback 테이블 + 그래프 뷰 |
| `/new/callbacks/:displayId` | `Callbacks` | 특정 Callback에 포커스(딥링크) |
| `/new/console` | `ConsoleSelection` | Console 탭 선택기 |
| `/new/console/:id` | `Console` | 인터랙티브 Tasking 터미널 |
| `/new/task` &middot; `/new/task/:displayId` | `SingleTaskView` | Task 단위 상세 뷰 |
| `/new/payloads` | `Payloads` | Payload 목록 + 탭(list／create／wrapper) |
| `/new/create-payload/*` | `CreatePayload` | 다단계 빌드 마법사 |
| `/new/create-wrapper` | (리다이렉트) | &rarr; `/payloads?tab=wrapper` |
| `/new/credentials` | `Credentials` | 자격 증명 Vault |
| `/new/files` | `Files` | 파일 관리 + 스크린샷 |
| `/new/c2-profiles` | `C2Profiles` | C2 Profile 관리 |
| `/new/payload-types` | `PayloadTypes` | 설치된 모든 Agent／Service |
| `/new/tunnels` | `Tunnels` | SOCKS／RPORTFWD 토폴로지 |
| `/new/quickhacks` | `QuickHacks` | 원클릭 워크플로 라이브러리 |
| `/new/metasploit` | `Metasploit` | MSF-RPC Dashboard／Attack／History |
| `/new/eventing` | `Eventing` | 워크플로／Event Group 빌더 |
| `/new/mitre` | `MitreAttack` | ATT&amp;CK 매트릭스 |
| `/new/search` | `Search` | 전역 검색 |
| `/new/artifacts` | `Artifacts` | Artifact 뷰어 |
| `/new/reporting` | `Reporting` | 리포트 빌더 |
| `/new/operations` | `Operations` | Operation 수명주기 + OPSEC Blocklist |
| `/new/users` | `Users` | Operator 관리 |
| `/new/browser-scripts` | `BrowserScripts` | 사용자 지정 Browser Script |
| `/new/tags` | `Tags` | 태그 관리 |
| `/new/opsec` | `Opsec` | Operation OPSEC 제어 |
| `/new/settings` | `Settings` | Operator 전체 환경설정 |

> 사이드바 항목은 **Settings &rarr; Sidebar Shortcuts**에서 Operator별로 재정렬하거나 숨길 수 있습니다. 기본 목록에는 `/new/jupyter`와 `/new/graphql` 외부 링크도 포함되며, 각각 Mythic의 Jupyter와 Hasura 콘솔을 엽니다.

---

## Tech Stack

| 분류 | 기술 |
|------|------|
| **Frontend** | React 19, TypeScript 5.9+, React Router 7 |
| **Styling** | Tailwind CSS 3.4, Material-UI 7, Emotion, Framer Motion |
| **State** | Zustand 5(영속화 App Store), Apollo Client 4(GraphQL + 캐시 + Reactive Vars) |
| **Real-time** | `graphql-ws`를 통한 WebSocket 상의 GraphQL Subscription |
| **3D** | Three.js 0.183, `@react-three/fiber`, `@react-three/drei` |
| **Graph** | `@xyflow/react` 12.6 + `elkjs` 0.11 계층 레이아웃 |
| **Charts** | MUI X Charts, MUI X Data Grid |
| **Editor** | React Ace(코드 편집기／Eventing 워크플로 구문 강조) |
| **Data &amp; Storage** | IndexedDB(`musicDB`, Custom Graph Node 캐시), 로컬 SQLite용 `sql.js`, 공유 상태용 Hasura `agentstorage` |
| **Animation** | Framer Motion(전환, 모달), CSS 애니메이션(스캔라인, 글리치) |
| **Build** | React App Rewired 2.2, Webpack 5, PostCSS, `config-overrides.js` |
| **Deploy** | Docker, Nginx(SSL + 리버스 프록시 + WS Upgrade) |
| **External** | HTTP 상의 JSON-RPC를 통한 MSF-RPC(Metasploit Framework) |

---

## Quick Start（Production）

### 사전 요구 사항

- [Docker](https://docs.docker.com/get-docker/)와 Docker Compose
- 호스트에서 접근 가능한 [Mythic C2](https://github.com/its-a-feature/Mythic) 인스턴스(기본값: `https://host.docker.internal:7443`)
- 호스트에서 **443** 포트 개방
- Minerva 컨테이너가 `host.docker.internal`로 접근할 수 있도록 Mythic의 `.env`가 loopback을 넘어 포트를 공개해야 합니다: `NGINX_BIND_LOCALHOST_ONLY="false"`와 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`. `scripts/minerva_install.sh`가 이를 설정해 줍니다.

### 원커맨드 설치（`minerva_install.sh`）— 권장

동봉된 설치 스크립트가 순정 Mythic에 도입하는 공식 지원 경로입니다. Minerva 자신의 스택을 배포하며 Mythic의 UI와 컨테이너는 전혀 건드리지 않습니다:

```bash
# /opt/Minerva 에서 실행
./scripts/minerva_install.sh          # 전체 설치(단계는 아래 참조)
./scripts/minerva_install.sh up       # minerva + minerva-dev 만 재빌드／시작
./scripts/minerva_install.sh down     # Minerva 스택 중지
./scripts/minerva_install.sh verify   # 설치 검증(.env 키, 컨테이너, HTTP 200)
./scripts/minerva_install.sh status   # Minerva + Mythic 컨테이너 상태와 로그 표시
./scripts/minerva_install.sh fix      # .env 재적용 후 스택 재빌드／재시작
./scripts/minerva_install.sh clean    # DB에서 Custom Graph Node 제거
./scripts/minerva_install.sh uninstall  # Minerva 스택 중지·제거(Mythic은 그대로)

# Metasploit:
./scripts/minerva_install.sh msf-start    # MSF-RPC 컨테이너 시작
./scripts/minerva_install.sh msf-stop     # MSF-RPC 컨테이너 중지
./scripts/minerva_install.sh msf-status   # 상태 + 로그
./scripts/minerva_install.sh msf-verify   # Python 연결 확인
```

설치 과정:

1. 컨테이너 간 도달성을 위해 Mythic의 `.env`를 설정합니다(멱등. 위의 두 `*_BIND_LOCALHOST_ONLY` 키).
2. `mythic_change.sh`를 실행해 Mythic의 Go 소스에 패치를 적용하고 `mythic_server`를 재빌드합니다(아래 참조).
3. Mythic Agent 측 패치를 적용합니다(Apollo SOCKS/TCP, IPC 버퍼).
4. Custom Graph Node가 Operator 간에 동기화되도록 Hasura `agentstorage` 테이블을 설정합니다.
5. `minerva` + `minerva-dev` 컨테이너를 빌드하고 시작합니다(nginx는 **443**).

Mythic을 건드리는 것은 1〜4단계뿐이며, 모두 백엔드에 한정되고 멱등합니다. Minerva의 UI가 Mythic의 파일 트리나 컨테이너에 들어가는 일은 없습니다. Mythic이 `/opt/Mythic`에 없다면 `MYTHIC_DIR` 환경 변수를 설정하십시오.

### 독립 컨테이너

```bash
git clone https://github.com/aifred0729-TW/Minerva.git
cd Minerva

# 앱 + Nginx 이미지를 빌드한 뒤 실행(자체 서명 인증서는 자동 생성)
docker compose build
docker compose up -d
```

> 최초 실행 시 `minerva-dev` 안에서 React 앱을 컴파일합니다 — 1〜2분 정도 기다리면 `https://<host>/`가 응답합니다. `minerva` Nginx 컨테이너는 준비되는 대로 프록시를 시작합니다.

**https://&lt;your-host&gt;/** 를 열면 `/new/login`으로 리다이렉트됩니다. Mythic 계정으로 로그인하십시오.

원격 Mythic 인스턴스를 가리키려면:

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

중지하려면:

```bash
docker compose down
```

> 기본 `docker-compose.yml`이 공개하는 것은 Minerva(포트 443)뿐입니다. `MYTHIC_ADDRESS`는 템플릿 변수로 Nginx에 전달되어 `/graphql`, `/auth`, `/refresh`, `/invite`, `/direct`의 upstream에 사용됩니다. 자동 생성된 자체 서명 인증서를 교체하려면 직접 준비한 `minerva.crt`／`minerva.key`를 `nginx/ssl/`에 넣으십시오.

---

## Development Mode（Hot Reload）

### 아키텍처

Dev 모드는 두 개의 컨테이너를 사용합니다:

| 컨테이너 | 역할 | 설명 |
|----------|------|------|
| `minerva-dev` | React Dev Server | 포트 3000에서 `react-app-rewired start`를 HMR과 함께 실행합니다. 소스 코드가 volume으로 마운트되어 변경 시 브라우저가 즉시 갱신됩니다. |
| `minerva`     | Nginx SSL Proxy  | 자체 서명 SSL로 **443**을 수신합니다. `/new/` &rarr; Dev Server, `/ws` &rarr; HMR WebSocket, 그리고 `/graphql/`, `/auth`, `/refresh`, `/invite`, `/msf-rpc/`, `/direct/` &rarr; Mythic으로 프록시합니다. |

```
Browser :443 ── nginx (SSL) ── minerva-dev :3000   (React dev server + HMR)
                       ├──  Mythic :7443           (API / GraphQL / WebSocket)
                       └──  Metasploit :55553      (optional MSF-RPC)
```

### 빠른 시작

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev   # "webpack compiled" 가 나올 때까지 대기
```

**https://&lt;your-host&gt;/** 를 엽니다 — `src/` 또는 `public/` 아래의 변경은 1초 이내에 Hot Reload됩니다.

### 마운트되는 Volume

| 호스트 경로 | 컨테이너 경로 | 용도 |
|-------------|---------------|------|
| `./src/` | `/app/src/` | React 소스(Hot Reload) |
| `./public/` | `/app/public/` | 정적 자산 |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind 테마 |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack 오버라이드 |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript 설정 |
| `./.env` | `/app/.env` | 빌드 시점 환경 변수 |

> `node_modules/`와 `package.json`은 **마운트되지 않습니다** — 이미지 안에 있습니다. npm 패키지를 추가·제거한 뒤에는 `docker compose -f docker-compose.dev.yml up -d --build`로 재빌드하십시오.

### 원격 Mythic에 연결

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 \
docker compose -f docker-compose.dev.yml up -d --build
```

### Dev와 Production 전환

```bash
# Dev (HMR) → Production
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# Production → Dev
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## 데스크톱 앱（Windows / macOS）

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="Minerva running as a desktop console" width="100%">
</p>

Minerva는 **Windows**와 **macOS**용 네이티브 콘솔로도 배포됩니다 — 동일한 React 번들을 Electron으로 감싼 것이며 `src/`의 포크는 존재하지 않습니다.

데스크톱 앱에는 nginx가 없고, 콘솔은 모든 백엔드를 자신의 origin을 통해 참조합니다(`window.location.origin + "/graphql/"`, `wss://" + window.location.host + "/graphql/"`, `/direct/download/...`). 그래서 프록시 계층을 프로세스 안으로 옮겼습니다. Electron 메인 프로세스가 `nginx.conf.template`을 라우트 단위로 그대로 옮긴 loopback gateway를 실행하고, 창은 거기서 번들을 읽어 들입니다. React 쪽에서는 차이를 알 수 없습니다.

**Operator는 로그인 화면이 나타나기 전에 어느 Mythic에 연결할지 지정합니다.** 컨테이너 배포에서 그 주소는 compose 설정이지만, 데스크톱에서는 하나의 실행 파일이 작전과 작전 사이를 옮겨 다닙니다. 그래서 앱은 먼저 연결 창을 열고 도달성 사전 점검을 수행한 뒤에야 넘겨줍니다:

```
실행 ──▶ 연결 창 ──▶ 사전 점검 ──▶ gateway ──▶ 콘솔 ──▶ Mythic 로그인
```

```bash
# 1. 저장소 루트에서 번들을 한 번 빌드합니다
npm install && npm run build

# 2. 셸을 패키징합니다
cd desktop
npm install
npm run dist:win     # NSIS 설치 파일 + 포터블, x64와 arm64
npm run dist:mac     # dmg + zip, arm64와 x64 (macOS 호스트 필요)
```

설치 파일은 `desktop/dist/`에 생성됩니다. `.github/workflows/desktop-build.yml`은 tag를 push하면 두 플랫폼을 빌드해 GitHub Release에 첨부합니다 — Mac 없이 `.dmg`를 얻는 방법이 바로 이것입니다.

컨테이너 배포와 의도적으로 다른 점이 두 가지 있습니다:

- **외부 통신은 기본적으로 차단됩니다.** Renderer는 loopback gateway 외에는 접근할 수 없으며, 이로 인해 번들의 Google Fonts 요청도 차단됩니다. C2 콘솔이 작전 중에 Operator의 머신에서 제3자에게 통신해서는 안 되기 때문입니다.
- **MSF-RPC는 게이트를 유지합니다.** `/msf-config`와 `/msf-rpc/`는 Mythic의 `GET /me`에 대한 서브리퀘스트로 인가됩니다. nginx가 적용하는 것과 동일한 `auth_request` 제어이므로, 유효한 Operator 토큰 없이 Metasploit에 도달할 수 없습니다.

전체 내용 — 아키텍처, HMR을 사용하는 개발 흐름, 서명, 설정 파일 위치, 보안 태세 — 은 [`desktop/README.md`](desktop/README.md)를 참고하십시오.

---

## Metasploit Integration

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit dashboard" width="100%">
</p>

Minerva에는 MSF-RPC 데몬 컨테이너가 뒷받침하는 일급 Metasploit 페이지가 포함되어 있습니다.

### Stack

```
React (Metasploit page)
   └── /msf-rpc/  (nginx, proxy_pass)
         └── minerva_msf :55553  (msfrpcd --user msf --pass <generated> -S  (bound to 127.0.0.1))
```

### MSF-RPC 시작

```bash
# 방법 A: minerva_install.sh 래퍼 사용
./scripts/minerva_install.sh msf-start
./scripts/minerva_install.sh msf-verify   # msfrpc_verify.py 를 통한 Python 연결 확인

# 방법 B: compose 직접 사용
docker compose -f docker-compose.metasploit.yml up -d
```

자격 증명／포트 재정의:

```bash
MSFRPC_USER=msf MSFRPC_PASS=changeme MSFRPC_PORT=55553 \
docker compose -f docker-compose.metasploit.yml up -d
```

> `MSFRPC_PASS`에는 기본값이 없습니다. `minerva_install.sh msf-start`가 값을 생성해 `.env.msf`에 기록하며, 이 파일은 git에서 제외되어 자격 증명이 커밋되는 일은 없습니다.

### 페이지 탭

| 탭 | 용도 |
|----|------|
| **Dashboard** | 연결 상태, 호스트 통계, Session 수, 최근 Job |
| **Attack** | Module Browser, 파라미터 폼, Target／Payload를 지정한 실행, 자격 증명 저장, 드라이런 미리보기 |
| **Operations** | 활성 Session, Job, Route — Session 종료, Job 중지, hop／portfwd |
| **History** | 실행한 모든 공격의 영속 이력(IndexedDB)과 전체 출력 |

MSF-RPC 클라이언트는 `src/Minerva/pages/Metasploit/msfrpc.ts`에 있습니다. 페이지는 15초마다 `getFullStatus`를 폴링하며 각 탭은 지연 로딩됩니다. MSF Route용 SOCKS 포트 할당은 공유되며 원자적이므로 두 Operator에게 같은 로컬 포트가 배정되지 않습니다.

---

## Setup Script（`minerva_install.sh`）

Mythic 옆에 Minerva를 설치하고, 선택적 MSF-RPC 서비스를 관리하며, 상태를 초기화하기 위한 통합 진입점입니다.

```
Usage: ./scripts/minerva_install.sh [command]

Commands:
  (none)      Full install (.env + backend patches + Hasura + bring up stack)
  up          Build & start the minerva + minerva-dev containers
  down        Stop the Minerva stack
  verify      Verify the installation is correct
  fix         Re-assert .env + rebuild/restart the stack
  status      Show Minerva + Mythic container status and logs
  clean       Remove custom graph nodes from the database
  uninstall   Stop & remove the Minerva stack (Mythic left untouched)

Metasploit:
  msf-start   Deploy & start Metasploit RPC container
  msf-stop    Stop Metasploit RPC container
  msf-status  Show Metasploit container status & logs
  msf-verify  Verify MSF-RPC connectivity (Python)

  help        Show this message

Environment:
  MYTHIC_DIR      Path to Mythic (default: /opt/Mythic)
  MYTHIC_ADDRESS  Nginx upstream for Mythic (set in docker-compose.yml;
                  default: https://host.docker.internal:7443)
```

이 스크립트는 멱등합니다 — 다시 실행해도 안전하며 이미 완료된 단계는 건너뜁니다. **불변 조건: 새로 clone한 상태에서 `minerva_install.sh`를 실행하면 순정 Mythic 위에 Minerva가 완전히 설치됩니다.**

---

## Mythic 소스 패치（`mythic_change.sh`）

Minerva의 일부 기능은 Mythic 백엔드가 자체적으로 제공하지 않는 동작을 필요로 합니다. 그런 변경은 **전부** 가드가 붙은 멱등 패치로 `scripts/mythic_change.sh`에 기록됩니다 — 그때그때의 임시 수정으로 남기는 일은 없습니다. 이 스크립트는 `minerva_install.sh`에서 연쇄 실행되므로, 새로 clone한 상태에서도 순정 Mythic 위에 전체 패치 집합이 재현됩니다.

| # | 파일 | 패치가 없을 때의 증상 | 수정 내용 |
|---|------|----------------------|-----------|
| **0** | Mythic `.env`(소스가 아닌 설정) | Minerva의 nginx 컨테이너가 `host.docker.internal`을 통해 Mythic의 7443／C2 포트에 도달하지 못함 — 신규 설치에서 connection refused | `NGINX_BIND_LOCALHOST_ONLY="false"`와 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`를 강제. postgres／rabbitmq／hasura／jupyter는 loopback 전용 유지 |
| **1** | `rabbitmq/utils.go` &middot; `GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue` | Array 타입 파라미터가 JSON 인코딩된 문자열로 도착하는 Payload를 가져오거나 재빌드할 때 `bad type for *_PARAMETER_TYPE_ARRAY: string` | 값이 올바른 JSON Array인지 검증하고 반환하는 `case string:` 추가 |
| **2** | `rabbitmq/utils.go` &middot; `getSyncToDatabaseValueForDefaultValue` | C2 Profile／Payload Type이 JSON 인코딩된 Array 기본값을 보내는 Agent Sync 시 동일한 오류 | 동일한 `case string:` 핸들러 |
| **3** | `webserver/controllers/hasura_claims.go` | Hasura가 `missing session variable: x-hasura-operations`로 요청을 거부 | 이미 생성되었지만 claims 맵에 기록되지 않던 `x-hasura-operations`／`x-hasura-admin-operations`를 대입 |
| **4** | `webserver/controllers/operationeventlog_create_webhook.go` | `mythic_server` 빌드 실패 — 사용되지 않는 `strings` import | 사용하지 않는 import 제거 |
| **5** | `agentstorage` 테이블(Hasura／Postgres) | Custom Graph Node의 upsert 실패 — `on_conflict`는 단순 unique index가 아니라 이름이 있는 제약을 요구 | unique INDEX를 이름 있는 CONSTRAINT로 변환 |
| **6** | `rabbitmq/util_agent_message_actions_update_info.go`<br>`rabbitmq/recv_mythic_rpc_callback_update.go` | Topology의 **Set Primary IP**가 몇 초 뒤 Agent 체크인에 덮어써짐. 체크인이 `callback.ip`를 인터페이스 열거 순서로 다시 쓰기 때문 | 저장된 IP와 수신 IP의 **집합**을 비교해 같으면 필드를 그대로 둠. 다르면 살아남은 Operator 순서의 IP를 앞에 두고 새 IP를 뒤에 추가 |
| **7** | `rabbitmq/util_agent_message_actions_post_response.go` | P2P 유령 링크: 이미 끊긴 링크에서 Apollo의 `unlink`는 `EdgeNode remove`를 내보내지 않아 `callbackgraphedge.end_timestamp`가 영원히 NULL로 남음 | 임의의 `unlink*` 명령이 완료되면 해당 Callback을 출발점으로 하는 활성 P2P 엣지를 양방향으로 종료 |
| **8** | `rabbitmq/util_agent_message.go` | 숨긴 P2P Callback이 릴레이 트래픽이 흐르는 순간 UI로 되돌아옴 | P2P Callback에서는 숨김이 유지되며, 명시적인 **Show Callback**으로만 복귀. 직결 C2 Callback은 동작 불변 |
| **9** | `rabbitmq/utils_proxy_traffic.go`<br>`rabbitmq/util_agent_message_push_c2.go` | SOCKS／RPORTFWD 처리량이 붕괴하고, 포화된 채널이 프레임을 조용히 버려 터널링된 TCP 스트림을 손상시킴 | Proxy 채널 버퍼를 1000 &rarr; 16384(최상위는 2000 &rarr; 16384)로, 조용히 버리던 세 곳의 select를 try-then-block-10s로 변경해 백프레셔가 Agent POST까지 전달되도록 하고, read loop의 20 ms 스로틀 제거 |
| **10** | `webserver/controllers/user_update_operator_password_webhook.go` | `operator.email`은 UNIQUE — email이 없는 계정의 두 번째 비밀번호 변경이 `''`에서 충돌. 그것도 비밀번호 쓰기가 이미 커밋된 뒤에 | 핸들러가 이미 계산해 둔 `sql.NullString`을 바인딩해 빈 email을 NULL로 저장 |

필요하다면 단독으로도 실행할 수 있습니다:

```bash
MYTHIC_DIR=/opt/Mythic ./scripts/mythic_change.sh
```

두 번 실행해도 안전합니다. Hasura 메타데이터 쪽(agentstorage 추적과 `minerva_%` 행 범위 지정)은 자매 스크립트인 `scripts/configure-hasura-agentstorage.sh`가 담당하며, 이 역시 `minerva_install.sh`에서 연쇄 실행됩니다.

---

## Project Structure

```
Minerva/
├── docker-compose.yml              # Standalone 스택(nginx + dev server) — 공식 배포 방식
├── docker-compose.dev.yml          # 개발용(nginx + dev server, 소스 마운트)
├── docker-compose.metasploit.yml   # 선택적 MSF-RPC 데몬
├── docker/
│   ├── Dockerfile.prod             # 정적 React + Nginx 빌드
│   ├── Dockerfile.dev              # Node dev server + HMR
│   ├── Dockerfile.nginx            # Nginx(dev compose에서 사용)
│   └── Dockerfile                  # Mythic 내부 빌드(구 방식)
├── nginx/
│   ├── nginx.conf.template         # Prod 템플릿(alias /new + 프록시)
│   ├── nginx.dev.conf.template     # Dev 템플릿(dev server 프록시 + /ws)
│   └── docker-entrypoint.sh        # SSL 인증서 생성 + envsubst
├── scripts/
│   ├── minerva_install.sh          # install / verify / fix / status / msf-*
│   ├── mythic_change.sh            # 모든 Mythic 측 패치의 멱등한 기록
│   ├── MythicAgentPatch.sh         # Agent 측 패치(Apollo SOCKS/TCP, IPC 버퍼)
│   ├── configure-hasura-agentstorage.sh   # 공유 그래프 상태를 위한 Hasura 메타데이터
│   ├── clear-custom-nodes.sh       # DB에서 Custom Graph Node 삭제
│   ├── clear-nodes.sql             # clear-custom-nodes가 사용하는 SQL
│   ├── debug-custom-nodes.sh       # Hasura에서 Custom Node 상태 출력
│   ├── msfrpc_verify.py            # MSF-RPC 연결 상태 점검
│   ├── take_screenshots.js         # README 스크린샷 촬영(Puppeteer)
│   └── take_login_only.js          # 로그인 화면 단발 촬영
├── docs/
│   ├── DESIGN_LANGUAGE.md          # UI 사양의 정본 — UI를 건드리기 전에 필독
│   ├── banner.jpg
│   └── screenshots/
├── public/                         # 정적 자산(favicon, 오디오 등)
├── tailwind.config.js              # 테마 토큰(signal/void/ghost/machine + accent)
├── postcss.config.js
├── config-overrides.js             # Webpack 오버라이드
├── tsconfig.json
├── package.json
└── src/
    ├── index.js                    # React root + Apollo + WS link
    ├── cache.js                    # Apollo cache + reactive vars
    ├── themes/                     # MUI 테마 브리지
    ├── components/                 # 기존 공용 컴포넌트
    └── Minerva/
        ├── App.tsx                 # Router + 인증 부트스트랩(라우트 code-split)
        ├── store.ts                # Zustand app store(사이드바, 오디오, Console 탭)
        ├── index.css               # Tailwind base + CSS 변수 + cyber-scrollbar
        │
        ├── context/
        │   ├── BattleModeContext.tsx
        │   └── ThemeContext.tsx
        │
        ├── pages/                  # 전체 라우트(지연 로딩)
        │   ├── Dashboard.tsx
        │   ├── Login.tsx · Invite.tsx
        │   ├── Topology3D/         # ★ 대표 뷰
        │   │   ├── index.tsx           (장면, 카메라, 레이아웃, 숨긴 스페이스)
        │   │   ├── SceneObjects.tsx    (노드, 엣지, 서브넷 볼륨, 라벨)
        │   │   ├── TunnelLayer.tsx     (SOCKS／RPORTFWD 오버레이)
        │   │   ├── DetailPanel.tsx     (노드 우클릭 메뉴)
        │   │   ├── QuickHack.tsx       (장면 내 공격 패널)
        │   │   ├── NodeDossier.tsx     (VIEW DETAILS — identity／platform／network／link)
        │   │   ├── defenseMatrix.tsx   (AV·EDR／방화벽／권한)
        │   │   ├── defenseMarks.ts     (Operator 표시, 호스트별 유지)
        │   │   ├── Topology3DModals.tsx
        │   │   └── topology.ts         (그래프 모델 + 배치)
        │   ├── Callbacks/          (graph + table + dialogs + utils)
        │   ├── Console/            (terminal + context menu + parsers)
        │   ├── ConsoleSelection.tsx
        │   ├── SingleTaskView/     (host tree, task detail, list)
        │   ├── Payloads/
        │   ├── CreatePayload/      (다단계 마법사)
        │   ├── CreateWrapper/
        │   ├── PayloadTypes/       (검색／정렬／agent icon + build params + commands + files)
        │   ├── Files/              (filetable, screenshots, modals)
        │   ├── Credentials.tsx
        │   ├── C2Profiles.tsx
        │   ├── Tunnels/ · TunnelMap.tsx
        │   ├── QuickHacks.tsx
        │   ├── Metasploit/         (msfrpc, LaunchAttack, Operations, TaskBrowser, history)
        │   ├── Eventing/           (워크플로 빌더, trigger, instance)
        │   ├── EventFeed.tsx
        │   ├── Operations/         (수명주기 + OPSEC blocklist)
        │   ├── Opsec.tsx
        │   ├── MitreAttack.tsx
        │   ├── BrowserScripts.tsx
        │   ├── Search/
        │   ├── Artifacts.tsx
        │   ├── Reporting.tsx
        │   ├── Tags.tsx
        │   ├── Users.tsx
        │   └── Settings/           (Audio, Palette, SidebarShortcuts, rows)
        │
        ├── components/             # 재사용 가능한 UI
        │   ├── Layout.tsx           # 공용 셸(사이드바 + outlet)
        │   ├── Sidebar.tsx
        │   ├── CallbackGraph/       # ReactFlow graph + nodes + edges + layout
        │   ├── FileBrowser/         # Callback／Server／가상 파일 트리
        │   ├── OutputRenderer/      # core, panels, parsed, graph 렌더러
        │   ├── CyberModal.tsx · CyberAlert · CyberDropdown · CyberTable
        │   ├── GlobalAudioPlayer.tsx
        │   ├── BattleMode.tsx
        │   ├── EventNotifications.tsx
        │   ├── ErrorBoundary.tsx
        │   ├── OSIcons.tsx
        │   └── …
        │
        ├── lib/
        │   ├── api/                 # GraphQL query／mutation／subscription, 도메인별
        │   ├── auth.ts               # JWT 헬퍼, refresh 로직
        │   ├── state.ts              # Apollo reactive vars(meState, mePreferences)
        │   ├── snackbar.ts           # toast 헬퍼
        │   ├── soundEffects.ts       # 이벤트별 SFX
        │   ├── musicDB.ts            # IndexedDB 음악 라이브러리
        │   ├── customGraphNodeService.ts  # 공유 그래프 노드(Hasura agentstorage)
        │   ├── useQueryCompat.ts     # Apollo 4 호환 레이어
        │   └── utils.ts
        │
        ├── hooks/                   # useCopyToClipboard, useDebounce, useFromNow, usePagination
        ├── types/                   # 각 도메인의 TS 인터페이스
        └── constants/               # api endpoint, 색상
```

> 모든 UI 작업은 [`docs/DESIGN_LANGUAGE.md`](docs/DESIGN_LANGUAGE.md)를 따릅니다 — 팔레트, 대비 규칙, 패널 프레임, 전환 연출을 규정하는 smooth advanced-minimalist Cyberpunk 사양입니다.

---

## Architecture

### Apollo client + reactive vars

- Metasploit RPC를 제외한 모든 것에서 **GraphQL**이 유일한 전송 계층입니다. Query와 Mutation은 도메인별로 `lib/api/*.ts`에 배치됩니다.
- **Subscription**은 동일한 `wss://<host>/graphql/` 엔드포인트 위에서 `graphql-ws`를 사용합니다. Callbacks, EventFeed, Payloads, PayloadTypes, Tunnels, Topology3D, Console이 실시간 갱신을 Subscription에 의존합니다.
- **Reactive Variables**(`meState`, `mePreferences`)가 인증된 사용자 상태와 환경설정 오버라이드를 모든 컴포넌트에 노출합니다.

### Routing과 code-splitting

- 모든 라우트는 `App.tsx`에서 `React.lazy`로 임포트되므로 초기 번들이 작게 유지되고, 라우트를 방문하는 시점에 해당 chunk가 스트리밍됩니다. chunk 로드 실패는 재시도로 복구되어 라우트가 막다른 길이 되지 않습니다.
- 인증된 모든 라우트는 하나의 공용 `<Layout />`에 마운트되므로, 사이드바·음악 플레이어·이벤트 알림·Battle Mode 셸이 화면 이동 중에 다시 마운트되지 않습니다.

### State

- **Zustand store**(`store.ts`, localStorage에 영속화)가 사이드바 접힘, Console 탭, 경고 수, 오디오(음악 라이브러리, 볼륨, SFX 개별 토글), 알림 설정을 보관합니다.
- **Apollo cache**가 GraphQL 엔티티를 보관합니다.
- **IndexedDB**가 음악 바이너리, MSF Task History, 로컬 Custom Graph Node 캐시를 저장합니다.
- **Mythic Operator Preferences**는 Operator가 기기를 옮겨도 따라와야 하는 것들을 담당합니다 — Topology의 숨긴 스페이스와 DEFENCE MATRIX 표시가 여기에 있으며, localStorage에는 두지 않습니다.

### 유휴 상태 동작

탭이 보이지 않을 때는 폴링과 Subscription이 멈추므로, 아무도 보고 있지 않은 동안 열려 있는 Minerva 창이 머신을 부하 상태로 붙잡아 두지 않습니다. Console은 Task마다가 아니라 공용 Subscription 하나만 엽니다.

### 생존 판정

UI의 Callback 생존 상태는 마지막 체크인을 Agent의 Sleep 간격과 대조해 계산합니다. Mythic의 `dead` 컬럼은 사용하지 않습니다 — 이 컬럼은 최대 1분까지 지연되어, Topology와 Callback 테이블에서 살아 있는 노드가 `DEAD`로 표시되기 때문입니다.

### 실시간 Custom Graph Node

Custom Graph Node는 Hasura의 `agentstorage` 테이블에 서버 측 저장되므로 모든 Operator가 동일한 토폴로지를 봅니다. `customGraphNodeService.ts`가 직렬화, 5초 폴링 동기화, 충돌에 강한 병합, `DEBUG_GRAPH` 로깅을 담당합니다. 필요한 Hasura 권한은 설치 시 `configure-hasura-agentstorage.sh`가 구성합니다.

---

## Routing &amp; Sidebar

사이드바(`components/Sidebar.tsx`)는 모든 페이지를 나열합니다. Operator는 **Settings &rarr; Sidebar Shortcuts**에서 순서를 바꾸거나 숨길 수 있습니다.

기본 키 집합(`getMythicSetting('sideShortcuts')`가 사용):

```
dashboard · events · callbacks · console · task · payloads · credentials · files
c2-profiles · tunnels · quickhacks · users · search · topology · metasploit · settings
opsec · operations · artifacts · mitre · reporting · tags · browser-scripts · eventing
payload-types · jupyter · graphql
```

`jupyter`와 `graphql`은 *외부* 링크로, Mythic의 Jupyter 노트북과 Hasura 콘솔을 엽니다.

---

## Nginx Proxy Layout

Nginx(포트 443, 자체 서명 SSL)가 유일한 진입점입니다. SSL을 종료하고 Mythic 또는 Metasploit으로 프록시합니다.

| Location | Upstream | 비고 |
|----------|----------|------|
| `/` | `/new/login`으로 리다이렉트 | |
| `/new/` | `minerva-dev:3000` | 앱 + HMR WS Upgrade |
| `/ws` | `minerva-dev:3000/ws` | webpack HMR 소켓 |
| `/graphql/` | `${MYTHIC_ADDRESS}/graphql/` | HTTP + WS Upgrade, read timeout 86400초 |
| `/auth` | `${MYTHIC_ADDRESS}/auth` | JWT 획득 |
| `/invite` | `${MYTHIC_ADDRESS}/invite` | Operator 초대 등록 |
| `/refresh` | `${MYTHIC_ADDRESS}/refresh` | JWT 갱신 |
| `/direct/` | `${MYTHIC_ADDRESS}/direct/` | 파일 다운로드 |
| `/msf-rpc/` | `minerva_msf:55553` | MSF-RPC JSON-RPC(선택) |

버퍼와 본문 크기는 큰 JWT(16k)와 50 MB 업로드에 맞춰 조정되어 있습니다.

---

## Theme System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings &amp; theme palette" width="100%">
</p>

Minerva는 CSS 사용자 정의 속성을 사용하므로 재컴파일 없이 테마를 교체할 수 있습니다. 기본 팔레트는 `index.css`에 정의되어 있습니다:

```css
/* Dark theme (default) */
:root {
  --color-signal:  255 255 255  /* text & highlights      */
  --color-accent:   34 197  94  /* green accent           */
  --color-void:      0   0   0  /* background             */
  --color-ghost:   153 153 153  /* borders & secondary    */
  --color-machine:  51  51  51  /* card backgrounds       */
}

/* Light theme */
:root.minerva-light {
  --color-signal:   30  30  40
  --color-accent:   22 163  74
  --color-void:    240 240 245
  --color-ghost:    90  90 100
  --color-machine: 225 225 230
}
```

폰트는 **JetBrains Mono**(고정폭)와 **Inter**(산세리프)입니다. Operator는 **Settings &rarr; Palette**에서 사용자 지정 배경 이미지와 컴포넌트별 출력 색상도 설정할 수 있습니다.

---

## Battle Mode

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Battle Mode on the Callbacks page" width="100%">
</p>

`context/BattleModeContext.tsx`는 세 가지 운용 모드를 제공합니다:

- **NORMAL** — 기본값. 모든 장식과 애니메이션 예산을 사용합니다.
- **RECON** — 비핵심 장식을 낮추고 가독성을 우선합니다.
- **COMBAT** — 전술 UI: 애니메이션 2배속, 액센트가 경고 적색으로 전환, 배경 SFX 볼륨 상승.

사이드바의 combat／recon 아이콘으로 전환합니다. 모드는 Zustand store에 영속화됩니다.

---

## Audio System

두 개의 계층:

1. **전역 음악 플레이어** — Operator가 업로드한 트랙을 IndexedDB(`musicDB`)에 저장합니다. 재생 상태는 `useAppStore`(`musicPlaying`, `musicTrackId`)를 통해 화면 이동과 전체 페이지 새로고침을 넘어 유지됩니다.
2. **사운드 이펙트** — 새 Callback, Tunnel, 인증 경고, 키 입력, 오류에 대한 이벤트별 SFX. **Settings &rarr; Audio**에서 개별적으로 켜고 끌 수 있습니다.

모든 오디오는 전역 `sfxEnabled`／`musicEnabled` 플래그를 따릅니다.

---

## Custom Graph Nodes

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Custom nodes in the Callbacks graph" width="100%">
</p>

Custom Node는 Mythic이 기본적으로 인식하지 못하는 Relay／Proxy 인프라를 표현합니다 — 위 3D Topology에 보이는 주황색 노드가 그것입니다. Hasura의 `agentstorage` 테이블에 영속화되므로 모든 Operator가 같은 화면을 봅니다.

| 동작 | 방법 |
|------|------|
| 노드 생성 | **Callbacks &rarr; Graph View**의 빈 공간을 우클릭 &rarr; *Create Custom Node* |
| 노드 연결 | 노드를 우클릭 &rarr; *Set Parent* |
| 편집／삭제 | 노드를 우클릭 &rarr; *Edit*／*Delete* |
| 전체 초기화 | `./scripts/clear-custom-nodes.sh` |

각 노드는 호스트명, IP, OS, 아키텍처, C2 Profile 선택, 위치, 색상을 저장합니다. 위치는 세션을 넘어 유지되며 데이터는 5초 폴링으로 접속 중인 Operator 사이에 동기화됩니다. 상세 로그가 필요하면 `CallbackGraph/index.tsx`의 `DEBUG_GRAPH`를 `true`로 설정하십시오.

---

## Authentication &amp; Sessions

- `/auth`, `/refresh`를 통한 JWT 인증(Access + Refresh 토큰).
- JWT 유효 기간은 4시간이며 백그라운드에서 자동 갱신됩니다.
- 토큰 갱신 시 WebSocket도 재인증되므로 GraphQL Subscription이 끊기지 않습니다.
- Session 만료 감지 — 30분 남았을 때 토스트 경고, 만료 시 강제 로그아웃.
- 로그아웃은 세션을 실제로 정리합니다: 토큰 삭제, Subscription 종료, 캐시 폐기.
- `<Layout />` 내부의 모든 라우트는 유효한 `meState`를 요구하며, 미인증 사용자는 `/login`으로 리다이렉트됩니다.

> Mythic의 `/auth` 응답에는 `admin` 필드가 없습니다. 그래서 Admin 권한이 필요한 UI는 로그인 응답이 아니라 `operator` 테이블에서 도출합니다.

---

## Environment Variables

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `MYTHIC_ADDRESS` | `https://host.docker.internal:7443` | 모든 Mythic API 호출에 대한 Nginx upstream |
| `MSFRPC_USER` | `msf` | MSF-RPC 사용자명(`docker-compose.metasploit.yml`) |
| `MSFRPC_PASS` | _(자동 생성)_ | MSF-RPC 비밀번호 — 필수이며 기본값 없음. `minerva_install.sh msf-start`가 `.env.msf`에 기록 |
| `MSFRPC_PORT` | `55553` | `minerva_msf`가 공개하는 포트 |
| `MYTHIC_DIR` | `/opt/Mythic` | `minerva_install.sh`와 `mythic_change.sh`가 사용 |
| `CHOKIDAR_USEPOLLING` | `true` | HMR을 위해 Docker 내부에서 파일 폴링 강제 |
| `WDS_SOCKET_PATH` | `ws` | Nginx 뒤의 HMR 소켓 경로 |
| `WDS_SOCKET_PORT` | `443` | Nginx 뒤의 HMR 소켓 포트 |

---

## Troubleshooting

| 증상 | 해결 |
|------|------|
| 신규 설치에서 Mythic에 도달하지 못함(connection refused) | Mythic의 `.env`가 여전히 loopback에 바인딩되어 있습니다. 두 `*_BIND_LOCALHOST_ONLY`를 `"false"`로 설정하고 `./mythic-cli start`, 또는 그냥 `./scripts/minerva_install.sh fix`를 실행하십시오. |
| CSS가 로드되지 않음 | `tailwind.config.js`와 `postcss.config.js`가 마운트되었는지 확인하고 `--build`로 재빌드하십시오. |
| Hot Reload가 동작하지 않음 | `docker logs minerva-dev`를 확인하십시오. Docker 내부의 Dev Server는 `CHOKIDAR_USEPOLLING=true`를 필요로 합니다. |
| 편집 후 `MODULE_NOT_FOUND` | `docker-compose.dev.yml`의 volume 마운트를 확인하십시오. |
| 추가한 npm 패키지를 찾지 못함 | 재빌드: `docker compose -f docker-compose.dev.yml up -d --build` |
| 브라우저 SSL 경고 | 정상입니다 — 자체 서명 인증서입니다. 인증서를 신뢰하거나 경고를 수락하십시오. |
| Payload build／import에서 `bad type for *_PARAMETER_TYPE_ARRAY: string` | `./scripts/mythic_change.sh`를 실행한 뒤 `mythic_server`를 재빌드하십시오. |
| Topology에서 살아 있는 호스트가 `DEAD`로 표시됨 | Mythic의 `dead` 컬럼은 지연됩니다. 마지막 체크인으로 생존을 계산하는 빌드인지 확인하십시오 — `./scripts/minerva_install.sh verify`. |
| 닫히지 않는 P2P 유령 링크 | Patch 7이 적용되지 않았습니다. `mythic_change.sh`를 다시 실행하고 `mythic_server`를 재빌드하십시오. |
| SOCKS／RPORTFWD가 매우 느리거나 스트림이 손상됨 | Patch 9가 적용되지 않았습니다. `mythic_change.sh`를 다시 실행하고 `mythic_server`를 재빌드하십시오. |
| 숨긴 P2P Callback이 계속 되돌아옴 | Patch 8이 적용되지 않았습니다. `mythic_change.sh`를 다시 실행하고 `mythic_server`를 재빌드하십시오. |
| Graph Node가 동기화되지 않음 | `./scripts/minerva_install.sh fix` — Hasura `agentstorage` 테이블을 검증합니다. |
| Graph Node가 손상됨 | `./scripts/clear-custom-nodes.sh`로 지우고 다시 시작하십시오. |
| Metasploit 페이지가 offline으로 표시됨 | `./scripts/minerva_install.sh msf-status`와 `msf-verify`를 실행하십시오. Settings의 `MSFRPC_USER`／`PASS`가 `msfrpcd`의 실제 값과 일치하는지 확인하십시오. |
| 사이드바 항목이 빠져 있음 | **Settings &rarr; Sidebar Shortcuts** — 저장된 순서가 새 항목을 숨기고 있을 수 있습니다. 기본값으로 되돌리십시오. |
| JWT 만료 토스트가 계속 표시됨 | 브라우저 시계가 어긋났을 수 있습니다. 시스템 시각을 동기화하고 localStorage를 비우십시오. |

---

## License

이 프로젝트는 이중 라이선스입니다:

- **오픈소스** — [AGPL-3.0](./LICENSE)
  AGPL-3.0 하에서 본 소프트웨어를 사용, 수정, 배포할 수 있습니다. 본 소프트웨어를 사용하는 파생 저작물이나 서비스 역시 AGPL-3.0으로 공개되어야 합니다.

- **상용 라이선스** — AGPL 의무 없이 독점／비공개 소스로 사용하는 경우. 연락처: **aifred0729tw@gmail.com**
