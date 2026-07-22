from supabase import create_client

URL = "https://ckzwlmoojtmcpwlqsqzv.supabase.co"
KEY = "sb_secret_NkwcIvqMYFA1ybDh_cUH0w_9TdimbO0"

supabase = create_client(URL, KEY)

# 예시: 테이블 조회
res = supabase.table('game_save').select('*').limit(1).execute()
print(res.data)

# 예시: RPC 호출
res = supabase.rpc('get_context', {'p_game_id': '...', 'p_recent_count': 15}).execute()
print(res.data)
