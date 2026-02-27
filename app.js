const CLIENT_ID = "ukzh4f4npg"; // 네이버 API 클라이언트 ID

let map;
let stops = []; // { address, lat, lng }
let markers = [];
let polyline = null;

// 지도 초기화
window.onload = function () {
  map = new naver.maps.Map("map", {
    center: new naver.maps.LatLng(37.5665, 126.978),
    zoom: 12,
  });
};

// 주소 추가
function addAddress() {
  const input = document.getElementById("addressInput");
  const query = input.value.trim();
  if (!query) return;

  setStatus("검색 중...");

  // 1차: Geocoding으로 시도 (주소/장소명 둘 다 지원)
  naver.maps.Service.geocode({ query }, function (status, response) {
    if (
      status === naver.maps.Service.Status.OK &&
      response.v2.addresses.length > 0
    ) {
      const result = response.v2.addresses[0];
      const lat = parseFloat(result.y);
      const lng = parseFloat(result.x);
      const label = result.roadAddress || result.jibunAddress || query;

      stops.push({ address: label, lat, lng });
      input.value = "";
      setStatus("");
      renderList();
      renderMap();
    } else {
      // 2차: 장소명 검색으로 fallback (네이버 지역 검색)
      searchByPlaceName(query, input);
    }
  });
}

// 장소명으로 검색 (네이버 검색 API 필요 없이 좌표 직접 조회)
function searchByPlaceName(query, input) {
  // Places API가 없을 경우 Geocoding 결과 없음을 안내하고
  // 사용자에게 후보 선택 UI 제공
  naver.maps.Service.geocode(
    { query: query + " " },
    function (status, response) {
      if (
        status === naver.maps.Service.Status.OK &&
        response.v2.addresses.length > 0
      ) {
        showCandidates(response.v2.addresses, query, input);
      } else {
        setStatus(
          "❌ 검색 결과가 없어요. 더 구체적인 주소나 장소명을 입력해보세요.",
        );
      }
    },
  );
}

// 여러 결과 나올 때 선택 UI
function showCandidates(addresses, query, input) {
  const existing = document.getElementById("candidates");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.id = "candidates";
  div.style =
    "background:#fff; border:1px solid #ccc; border-radius:8px; margin-bottom:8px;";

  addresses.slice(0, 5).forEach((addr, i) => {
    const label = addr.roadAddress || addr.jibunAddress;
    const btn = document.createElement("div");
    btn.style =
      "padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; font-size:14px;";
    btn.textContent = `📍 ${label}`;
    btn.onclick = () => {
      stops.push({
        address: label,
        lat: parseFloat(addr.y),
        lng: parseFloat(addr.x),
      });
      input.value = "";
      div.remove();
      setStatus("");
      renderList();
      renderMap();
    };
    div.appendChild(btn);
  });

  document
    .getElementById("panel")
    .insertBefore(div, document.getElementById("status"));
  setStatus("아래 결과 중 선택해주세요.");
}

// 엔터키로도 추가
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addressInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAddress();
  });
});

// 목록 렌더링
function renderList() {
  const list = document.getElementById("list");
  list.innerHTML = "";
  stops.forEach((stop, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="num">${i + 1}</span>
      <span>${stop.address}</span>
      <button class="del-btn" onclick="deleteStop(${i})">삭제</button>
    `;
    list.appendChild(li);
  });
}

// 지도 마커 + 경로선 렌더링
function renderMap() {
  // 기존 마커 제거
  markers.forEach((m) => m.setMap(null));
  markers = [];
  if (polyline) {
    polyline.setMap(null);
    polyline = null;
  }

  if (stops.length === 0) return;

  const bounds = new naver.maps.LatLngBounds();

  stops.forEach((stop, i) => {
    const pos = new naver.maps.LatLng(stop.lat, stop.lng);
    bounds.extend(pos);

    // 번호 마커
    const marker = new naver.maps.Marker({
      position: pos,
      map: map,
      icon: {
        content: `<div style="
          background:#2e7d32; color:white; border-radius:50%;
          width:28px; height:28px; display:flex; align-items:center;
          justify-content:center; font-weight:bold; font-size:13px;
          border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3);">
          ${i + 1}
        </div>`,
        anchor: new naver.maps.Point(14, 14),
      },
    });

    // 정보창
    const infoWindow = new naver.maps.InfoWindow({
      content: `<div style="padding:8px; font-size:13px;">${i + 1}. ${stop.address}</div>`,
    });
    naver.maps.Event.addListener(marker, "click", () => {
      infoWindow.open(map, marker);
    });

    markers.push(marker);
  });

  // 경로선
  if (stops.length > 1) {
    const path = stops.map((s) => new naver.maps.LatLng(s.lat, s.lng));
    polyline = new naver.maps.Polyline({
      path,
      map,
      strokeColor: "#1565c0",
      strokeWeight: 4,
      strokeOpacity: 0.7,
    });
  }

  map.fitBounds(bounds, { padding: 60 });
}

// 경로 안내 시작 (네이버 지도 앱 or 웹으로 연결)
function startRoute() {
  if (stops.length < 2) {
    setStatus("❌ 목적지를 2개 이상 추가해주세요.");
    return;
  }

  // 마지막 목적지로 네이버 지도 길찾기 열기
  // 경유지 포함 URL 구성
  const last = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);

  let url = `https://map.naver.com/v5/directions/-/-/-/car?`;

  // 네이버 지도는 URL로 다중 경유지 지원
  // 방식: 출발 / 경유 / 도착 각각 좌표로
  const coords = stops.map(
    (s) => `${s.lng},${s.lat},${encodeURIComponent(s.address)}`,
  );

  // 모바일 앱 연결 시도 후 웹으로 fallback
  const destination = `${last.lat},${last.lng}`;
  const appUrl = buildNaverRouteUrl(stops);

  window.open(appUrl, "_blank");
}

function buildNaverRouteUrl(stops) {
  if (stops.length < 2) return "";

  const start = stops[0];
  const end = stops[stops.length - 1];
  const mid = stops.slice(1, -1);

  // 네이버 지도 웹 길찾기 URL
  let url = `https://map.naver.com/p/directions/`;
  url += `${start.lng},${start.lat},${encodeURIComponent(start.address)},${encodeURIComponent(start.address)},land/`;

  mid.forEach((s) => {
    url += `${s.lng},${s.lat},${encodeURIComponent(s.address)},${encodeURIComponent(s.address)},land/`;
  });

  url += `${end.lng},${end.lat},${encodeURIComponent(end.address)},${encodeURIComponent(end.address)},land`;
  url += `/-/-/-/car?c=15,0,0,0,dh`;

  return url;
}

// 항목 삭제
function deleteStop(index) {
  stops.splice(index, 1);
  renderList();
  renderMap();
}

// 전체 초기화
function clearAll() {
  stops = [];
  renderList();
  renderMap();
  setStatus("");
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}
