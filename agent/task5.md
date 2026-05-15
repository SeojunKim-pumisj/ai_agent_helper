# Task 5. Papago API 연동 및 IPC 번역 파이프라인 구축

## 목표
Renderer 입력부터 Papago API 호출, 응답 반환까지 보안된 비동기 번역 흐름을 구현한다.

## 범위
- 번역 요청은 Renderer -> Preload IPC -> Main에서만 외부 API 호출.
- Papago NMT REST POST 구현 (출발어 auto, 도착어 설정값 반영).
- 요청/응답 스키마 정규화 및 에러 매핑:
  - 인증 오류
  - 네트워크 오류/타임아웃
  - 할당량/서버 오류
- 재시도 전략(선택): 일시 오류에 한해 제한적 재시도.
- 민감 정보(API 키) 로그 마스킹.

## 산출물
- 실제 Papago 번역 결과가 Renderer로 반환.
- 오류 상황에서 사용자 친화적 메시지 제공.

## 완료 기준 (DoD)
- 정상 입력 시 번역 결과가 2초~수초 내 응답된다(네트워크 환경 의존).
- API 실패 시 앱이 멈추지 않고 복구 가능 상태 유지.
- Renderer 코드에 API Secret이 직접 노출되지 않는다.

## 의존성
- 선행: Task 4
- 후행: Task 6, Task 7
