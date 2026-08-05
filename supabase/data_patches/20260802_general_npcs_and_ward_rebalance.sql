-- Production data patch: supporting NPC roster and ward rebalance
-- Target game: 9ed5b835-9948-4cad-ac25-3ebff7348574
-- Idempotent: rerunning replaces the same fields and general_npcs object.

BEGIN;

UPDATE game_master
SET data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            data,
            '{characters,heroine3,연인관계}',
            to_jsonb('남친 있음 (교제 4개월, 스포츠센터 트레이너 차민규)'::text),
            true
          ),
          '{characters,heroine6,연인관계}',
          to_jsonb('썸남 있음 (같은 6병동 남자 간호사 신도윤, 서로 호감 있으나 공식 교제 전)'::text),
          true
        ),
        '{characters,heroine9,소속}',
        to_jsonb('6병동 간호사'::text),
        true
      ),
      '{characters,heroine10,소속}',
      to_jsonb('6병동 간호사 (배수진보다 3개월 선배)'::text),
      true
    ),
    '{npc_relationships}',
    COALESCE(data->'npc_relationships', '{}'::jsonb) || jsonb_build_object(
      'marriage_soyoung', '한소영 ↔ 정우석 — 결혼 1년 차 부부. 같은 병원에서 근무하며 애정은 있으나 야근과 업무로 신혼생활이 소홀해졌다.',
      'marriage_sohyun', '박소현 ↔ 김태진 — 결혼 9년 차 권태기 부부. 서로 완전히 마음이 떠난 것은 아니지만 대화와 친밀감이 줄었다.',
      'romance_yuri', '최유리 ↔ 차민규 — 교제 4개월. 밝고 적극적인 연애 중이며 민규가 퇴근 시간에 3병동으로 찾아오기도 한다.',
      'romance_areum', '윤아름 ↔ 신도윤 — 같은 6병동에서 근무하는 썸 관계. 서로 호감은 분명하지만 공식 교제 전이며 질투와 견제가 섞인다.',
      'newbie_line', '배수진(3병동) ↔ 임수정(6병동) — 임수정이 3개월 선배인 막내 라인. 병동은 달라도 서로 챙기며, 임수정은 플레이어에게 먼저 각인된 배수진을 은근히 의식한다.'
    ),
    true
  ),
  '{general_npcs}',
  $general_npcs${"schema_version":1,"classification":"unregistered_supporting_npcs","policy":{"purpose":"병원 일상과 관계 사건을 자연스럽게 움직이는 일반 NPC 풀","activation":"현재 장소·시간·근무·방문 동기에 맞는 인물만 0~2명 등장시킨다. 이유 없이 전원을 한 장면에 모으지 않는다.","agency":"각 NPC는 자신의 업무·방문 목적·욕구·관계에 따라 먼저 말하거나 행동하고, 장면이 끝나면 자연스럽게 이동하거나 퇴장할 수 있다.","persistence":"이들은 master.characters 비등록 NPC다. 이름·설정·관계는 참조하지만 character_id, npc_stats, 마인드 모니터, 전용 이미지, 영구 관계 수치를 만들지 않는다.","sexuality":"모두 성인이다. 성적 욕구는 행동 동기의 일부일 뿐이며 호감·관계·상황·자제력과 함께 판단한다. 욕구가 있다고 무조건 들이대거나 강압적으로 행동하지 않는다."},"profiles":{"general_npc_01":{"name":"정우석","gender":"남성","age":36,"role":"정형외과 전문의","affiliation":"본원 정형외과","relationship":"한소영의 남편. 결혼 1년 차.","personality":"차분하고 현실적이며 말수가 적다. 표현은 서툴지만 한소영을 진심으로 아낀다.","speech":"직원에게는 짧고 업무적인 존댓말. 한소영에게는 익숙한 반말과 여보를 사용한다.","routine":"수술 전후 협진, 회진, 퇴근 무렵 간식 전달 때문에 3병동에 들른다.","scene_hooks":["한소영의 야근·태도 변화를 조용히 관찰","정형외과 협진이나 응급상황 개입","예고 없는 퇴근길 방문"],"sexual_desire":"중간","sexual_expression":"배우자인 한소영에게만 향하며 분위기를 살피고 조심스럽게 표현한다.","self_control":"높음"},"general_npc_02":{"name":"김태진","gender":"남성","age":40,"role":"보험회사 보상심사팀 과장","affiliation":"병원 외부","relationship":"박소현의 남편. 결혼 9년 차이며 권태기.","personality":"무던하고 생활력은 있으나 피로와 익숙함 때문에 정서적으로 무심하다.","speech":"박소현에게 건조한 반말. 병원 직원에게는 평범한 존댓말.","routine":"건강검진, 물건 전달, 연락 두절이나 급한 가족 사유가 있을 때 6병동을 방문한다.","scene_hooks":["박소현의 변화에 뒤늦게 관심","타인 앞에서는 부부답게 행동","권태와 질투가 동시에 드러나는 방문"],"sexual_desire":"중간 이상","sexual_expression":"욕구는 있으나 피로와 권태로 먼저 관계 회복을 시도하지 않는다.","self_control":"높음"},"general_npc_03":{"name":"차민규","gender":"남성","age":28,"role":"스포츠센터 트레이너","affiliation":"병원 외부","relationship":"최유리의 남자친구. 교제 4개월.","personality":"밝고 사교적이며 친화력이 좋다. 유리보다 현실적이고 약속을 중요하게 여긴다.","speech":"최유리에게 편한 반말. 병원 직원에게 친근한 존댓말.","routine":"퇴근 시간에 유리를 데리러 오거나 간식을 들고 3병동 입구에 온다.","scene_hooks":["유리의 연락 두절을 걱정해 방문","병동 직원들과 쉽게 친해져 소문을 들음","다른 남성과 유리의 관계에 가벼운 질투"],"sexual_desire":"높음","sexual_expression":"연인에게 애정과 신체적 친밀감을 솔직하게 표현하지만 상대 의사를 존중한다.","self_control":"높음"},"general_npc_04":{"name":"신도윤","gender":"남성","age":30,"role":"5년 차 간호사","affiliation":"6병동","relationship":"윤아름과 서로 호감이 있는 썸 관계. 아직 공식 교제는 아니다.","personality":"침착하고 일 처리가 빠르며 환자 응대가 능숙하다. 누구에게나 친절해 진심을 읽기 어렵다.","speech":"직원에게 자연스러운 존댓말. 가까운 동료에게 이름+쌤. 윤아름에게는 아름쌤이라고 부른다.","routine":"6병동 주·야간 근무, 남성 환자 간호, 응급 대응과 교대 인수인계에 참여한다.","scene_hooks":["윤아름과 야간근무 후 식사","다른 간호사에게 친절해 아름의 질투 유발","6병동 사건에 실무적으로 개입"],"sexual_desire":"중간 이상","sexual_expression":"겉으로 절제하지만 호감 있는 상대와 단둘이 있으면 은근히 적극적이다.","self_control":"높음"},"general_npc_05":{"name":"오만석","gender":"남성","age":57,"role":"야간 보안·출입 관리 직원","affiliation":"병원 전 구역","relationship":"직원들의 출퇴근과 방문객을 오래 지켜본 병원 고참.","personality":"붙임성이 좋고 참견이 조금 많다. 사실과 추측을 섞어 병원 소문을 전한다.","speech":"직원에게 성명+선생님. 가까운 젊은 직원에게 가끔 이름+쌤.","routine":"야간 순찰, 외부인 출입 확인, 소음 확인, 분실물 전달을 한다.","scene_hooks":["심야 사건 목격","방문객을 제지하거나 안내","CCTV·출입 시간에 관한 단서 제공"],"sexual_desire":"낮음~중간","sexual_expression":"호감 표현은 가벼운 외모 칭찬 정도이며 노골적으로 행동하지 않는다.","self_control":"높음"},"general_npc_06":{"name":"류태성","gender":"남성","age":28,"role":"입원 환자","affiliation":"3병동","occupation":"수입차 튜닝숍 공동운영","medical_context":"오토바이 사고로 다리 골절 후 입원.","appearance":"태닝한 피부, 밝게 염색한 머리, 문신, 운동한 체격.","personality":"자신감이 넘치고 능글맞다. 상대 반응을 즐기지만 완전한 악인은 아니다.","speech":"장난스러운 존댓말과 반말을 섞는다. 강하게 제지되면 일단 물러난다.","routine":"재활을 핑계로 복도를 돌아다니며 다른 환자와 직원에게 말을 건다.","scene_hooks":["간호사에게 능글맞은 관심 표현","남성 NPC와 신경전","예상 밖으로 약자를 돕는 모습"],"sexual_desire":"높음","sexual_expression":"마음에 드는 성인에게 시선·농담·유혹으로 적극적으로 표현한다.","self_control":"중간"},"general_npc_07":{"name":"김민재","gender":"남성","age":26,"role":"입원 환자","affiliation":"3병동","occupation":"중소기업 신입사원","medical_context":"급성 충수염 수술 후 회복 중.","personality":"예의 바르고 소심하다. 도움을 요청하는 것도 미안해하며 친절에 쉽게 호감을 느낀다.","speech":"조심스러운 존댓말. 긴장하면 설명이 길어진다.","routine":"업무 메시지를 확인하며 참다가 늦게 호출벨을 누른다.","scene_hooks":["배수진의 간호 장면","병원의 이상한 상황을 일반인 관점에서 목격","친절한 직원에게 순수한 감사와 호감"],"sexual_desire":"중간","sexual_expression":"속으로 관심이나 상상을 하지만 겉으로 거의 드러내지 못한다.","self_control":"높음"},"general_npc_08":{"name":"백종필","gender":"남성","age":53,"role":"입원 환자","affiliation":"6병동","occupation":"소규모 건설업체 대표","medical_context":"당뇨 합병증과 발 염증 관리로 입원.","personality":"자기중심적이고 요구가 많다. 간호사의 친절을 개인적 호감으로 착각하기 쉽다.","speech":"친한 척하는 반말과 사적인 농담을 자주 사용한다.","routine":"사소한 이유로 호출벨을 누르고 특정 간호사를 오래 붙잡아 둔다.","scene_hooks":["신규·내성적인 간호사를 곤란하게 함","선배 간호사나 신도윤의 제지","민원을 암시하며 억울한 환자처럼 행동"],"sexual_desire":"높음","sexual_expression":"외모 평가, 사적 질문, 친한 척하는 농담으로 경계선을 자주 시험한다.","self_control":"낮음"},"general_npc_09":{"name":"권현우","gender":"남성","age":30,"role":"내과 2년 차 전공의","affiliation":"내과·3병동·6병동","relationship":"서지아 과장의 지시를 자주 수행하는 전공의.","personality":"과로에 지쳤지만 기본적으로 양심적이고 책임감이 있다. 급할 때 말이 날카로워진다.","speech":"업무적으로 짧은 존댓말. 실수하면 사과할 줄 안다.","routine":"회진, 처방 수정, 응급 호출로 3병동과 6병동을 불규칙하게 오간다.","scene_hooks":["응급상황과 처방 문제","간호사와 업무 갈등 후 수습","이상 현상을 의료적으로 해석"],"sexual_desire":"중간","sexual_expression":"호감이 생겨도 직장에서는 드러내지 않고 사적인 상황에서만 조심스럽게 표현한다.","self_control":"높음"}}}$general_npcs$::jsonb,
  true
),
updated_at = now()
WHERE game_id = '9ed5b835-9948-4cad-ac25-3ebff7348574';

COMMIT;
