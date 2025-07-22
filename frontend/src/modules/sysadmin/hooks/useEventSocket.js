import { useEffect, useRef } from "react";

/**
 * 실시간 WebSocket 이벤트를 수신하는 커스텀 훅 (onEvent 콜백은 ref로 고정)
 * @param {(msg: object) => void} onEvent
 */
export function useEventSocket(onEvent) {
  const wsRef = useRef(null);
  const onEventRef = useRef(onEvent);

  // onEvent가 바뀔 때마다 ref에 저장(불필요한 재연결 방지)
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/sysadmin/ws/events`;
    const ws = new window.WebSocket(wsUrl);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        onEventRef.current && onEventRef.current(msg);
      } catch (e) {}
    };
    ws.onerror = (e) => {
      // 원하는 경우 에러 로그 출력
      // console.error("WebSocket error:", e);
    };
    ws.onclose = (e) => {
      // 필요시 닫힘 로그
      // console.log("WebSocket closed:", e);
    };

    wsRef.current = ws;
    return () => {
      wsRef.current && wsRef.current.close();
    };
  }, []); // 의존성 없음: 최초 마운트/언마운트 시 한 번만 실행
}
