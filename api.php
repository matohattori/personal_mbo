<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

$action = $_POST['action'] ?? '';

try {
    $db = init_db();
    route($db, $action);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'サーバーエラー: ' . $e->getMessage()]);
    exit;
}

function init_db(): SQLite3 {
    $db = new SQLite3(__DIR__ . '/mbo.db');
    $db->exec('PRAGMA foreign_keys = ON;');

    $db->exec('CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT "user"
    )');

    $db->exec('CREATE TABLE IF NOT EXISTS goal_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )');

    $db->exec('CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        goal_type_id INTEGER,
        title TEXT NOT NULL,
        issue TEXT,
        summary TEXT,
        memo TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(goal_type_id) REFERENCES goal_types(id) ON DELETE SET NULL
    )');

    $db->exec('CREATE TABLE IF NOT EXISTS majors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        idx INTEGER NOT NULL,
        content TEXT,
        due_term TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE
    )');

    $db->exec('CREATE TABLE IF NOT EXISTS admin_notes (
        goal_id INTEGER PRIMARY KEY,
        memo TEXT,
        FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE
    )');


    // 初期管理者作成（users が空の場合のみ）
    $count = (int)$db->querySingle('SELECT COUNT(*) FROM users');
    if ($count === 0) {
        $adminId = 'admin';
        $adminName = 'Administrator';
        $adminPassword = 'ChangeMe123!'; // 初期パスワード（運用開始後に変更推奨）

        $hash = password_hash($adminPassword, PASSWORD_DEFAULT);
        $stmt = $db->prepare('INSERT INTO users (id, name, password_hash, role) VALUES (:id, :name, :hash, "admin")');
        $stmt->bindValue(':id', $adminId, SQLITE3_TEXT);
        $stmt->bindValue(':name', $adminName, SQLITE3_TEXT);
        $stmt->bindValue(':hash', $hash, SQLITE3_TEXT);
        $stmt->execute();
    }

    return $db;
}

function route(SQLite3 $db, string $action): void {
    switch ($action) {
        case 'login': handle_login($db); break;
        case 'register': handle_register($db); break;
        case 'logout': handle_logout(); break;
        case 'update_password': require_login(); handle_update_password($db); break;

        case 'init': require_login(); handle_init($db); break;
        case 'get_user_goals': require_login(); handle_get_user_goals($db); break;
        case 'save_goal': require_login(); handle_save_goal($db); break;
        case 'delete_goal': require_login(); handle_delete_goal($db); break;
        case 'update_major_done': require_login(); handle_update_major_done($db); break;

        case 'get_goal_types': require_login(); handle_get_goal_types($db); break;
        case 'add_goal_type': require_admin(); handle_add_goal_type($db); break;
        case 'delete_goal_type': require_admin(); handle_delete_goal_type($db); break;

        case 'get_admin_goals': require_admin(); handle_get_admin_goals($db); break;
        case 'save_admin_memo': require_admin(); handle_save_admin_memo($db); break;

        default:
            http_response_code(400);
            echo json_encode(['error' => '未知のアクションです']);
    }
}

function current_user_id(): ?string { return $_SESSION['user_id'] ?? null; }
function current_user_role(): ?string { return $_SESSION['role'] ?? null; }

function require_login(): void {
    if (!current_user_id()) {
        http_response_code(401);
        echo json_encode(['error' => 'ログインしてください']);
        exit;
    }
}
function require_admin(): void {
    require_login();
    if (current_user_role() !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => '管理者権限が必要です']);
        exit;
    }
}

function handle_login(SQLite3 $db): void {
    $uid = trim($_POST['uid'] ?? '');
    $pw = $_POST['password'] ?? '';
    if ($uid === '' || $pw === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ユーザーIDとパスワードを入力してください']);
        return;
    }
    $stmt = $db->prepare('SELECT id,name,password_hash,role FROM users WHERE id=:id');
    $stmt->bindValue(':id',$uid,SQLITE3_TEXT);
    $res=$stmt->execute();
    $row=$res->fetchArray(SQLITE3_ASSOC);
    if(!$row){
        http_response_code(404);
        echo json_encode(['error'=>'未登録のIDです。新規登録してください。']);
        return;
    }
    if(!password_verify($pw,$row['password_hash'])){
        http_response_code(401);
        echo json_encode(['error'=>'パスワードが正しくありません']);
        return;
    }
    $_SESSION['user_id']=$row['id'];
    $_SESSION['role']=$row['role'];
    echo json_encode(['user'=>['id'=>$row['id'],'name'=>$row['name'],'role'=>$row['role']]]);
}

function handle_register(SQLite3 $db): void {
    $uid=trim($_POST['uid'] ?? '');
    $name=trim($_POST['name'] ?? '');
    $pw=$_POST['password'] ?? '';
    if($uid===''||$name===''||$pw===''){
        http_response_code(400);
        echo json_encode(['error'=>'すべて入力してください']);
        return;
    }
    $stmt=$db->prepare('SELECT id FROM users WHERE id=:id');
    $stmt->bindValue(':id',$uid,SQLITE3_TEXT);
    $res=$stmt->execute();
    if($res->fetchArray(SQLITE3_ASSOC)){
        http_response_code(400);
        echo json_encode(['error'=>'このユーザーIDは既に使われています']);
        return;
    }
    $hash=password_hash($pw,PASSWORD_DEFAULT);
    $stmt=$db->prepare('INSERT INTO users(id,name,password_hash,role) VALUES(:id,:name,:hash,"user")');
    $stmt->bindValue(':id',$uid,SQLITE3_TEXT);
    $stmt->bindValue(':name',$name,SQLITE3_TEXT);
    $stmt->bindValue(':hash',$hash,SQLITE3_TEXT);
    $stmt->execute();
    $_SESSION['user_id']=$uid;
    $_SESSION['role']='user';
    echo json_encode(['user'=>['id'=>$uid,'name'=>$name,'role'=>'user']]);
}

function handle_logout(): void {
    session_destroy();
    echo json_encode(['ok'=>true]);
}

function handle_update_password(SQLite3 $db): void {
    $uid=current_user_id();
    $current=$_POST['current'] ?? '';
    $new=$_POST['newpass'] ?? '';
    if($current===''||$new===''){
        http_response_code(400);
        echo json_encode(['error'=>'現在のパスワードと新しいパスワードを入力してください']);
        return;
    }
    $stmt=$db->prepare('SELECT password_hash FROM users WHERE id=:id');
    $stmt->bindValue(':id',$uid,SQLITE3_TEXT);
    $res=$stmt->execute();
    $row=$res->fetchArray(SQLITE3_ASSOC);
    if(!$row||!password_verify($current,$row['password_hash'])){
        http_response_code(401);
        echo json_encode(['error'=>'現在のパスワードが正しくありません']);
        return;
    }
    $hash=password_hash($new,PASSWORD_DEFAULT);
    $stmt=$db->prepare('UPDATE users SET password_hash=:h WHERE id=:id');
    $stmt->bindValue(':h',$hash,SQLITE3_TEXT);
    $stmt->bindValue(':id',$uid,SQLITE3_TEXT);
    $stmt->execute();
    echo json_encode(['ok'=>true]);
}

function handle_init(SQLite3 $db): void {
    $uid=current_user_id();
    $role=current_user_role();
    $goalTypes=fetch_goal_types($db);
    $userGoals=fetch_user_goals($db,$uid);
    $adminGoals=[];
    if($role==='admin') $adminGoals=fetch_admin_goals($db);
    echo json_encode(['goalTypes'=>$goalTypes,'userGoals'=>$userGoals,'adminGoals'=>$adminGoals]);
}

function fetch_goal_types(SQLite3 $db): array {
    $r=$db->query('SELECT id,name FROM goal_types ORDER BY id');
    $rows=[];
    while($row=$r->fetchArray(SQLITE3_ASSOC)) $rows[]=$row;
    return $rows;
}

function fetch_majors(SQLite3 $db,int $goal_id): array {
    $stmt=$db->prepare('SELECT id,idx,content,due_term,done FROM majors WHERE goal_id=:gid ORDER BY idx');
    $stmt->bindValue(':gid',$goal_id,SQLITE3_INTEGER);
    $res=$stmt->execute(); $rows=[];
    while($row=$res->fetchArray(SQLITE3_ASSOC)){ $row['done']=(bool)$row['done']; $rows[]=$row; }
    return $rows;
}

function fetch_user_goals(SQLite3 $db,string $uid): array {
    $stmt=$db->prepare('SELECT g.*,t.name AS goal_type_name
                        FROM goals g LEFT JOIN goal_types t ON g.goal_type_id=t.id
                        WHERE g.user_id=:uid ORDER BY g.id');
    $stmt->bindValue(':uid',$uid,SQLITE3_TEXT);
    $res=$stmt->execute(); $rows=[];
    while($row=$res->fetchArray(SQLITE3_ASSOC)){
        $row['majors']=fetch_majors($db,(int)$row['id']);
        $rows[]=$row;
    }
    return $rows;
}

function handle_get_user_goals(SQLite3 $db): void {
    $uid=current_user_id();
    echo json_encode(['userGoals'=>fetch_user_goals($db,$uid)]);
}

function handle_save_goal(SQLite3 $db): void {
    $uid=current_user_id();
    $id=$_POST['id'] ?? '';
    $gtid=$_POST['goal_type_id']!==''?(int)$_POST['goal_type_id']:null;
    $title=trim($_POST['title'] ?? '');
    $issue=$_POST['issue'] ?? '';
    $summary=$_POST['summary'] ?? '';
    $memo=$_POST['memo'] ?? '';
    $majors_json=$_POST['majors'] ?? '[]';
    if($title===''){http_response_code(400);echo json_encode(['error'=>'目標を入力してください']);return;}
    $db->exec('BEGIN');
    try{
        if($id===''||$id==='0'){
            $stmt=$db->prepare('INSERT INTO goals(user_id,goal_type_id,title,issue,summary,memo)
                                VALUES(:uid,:gtid,:title,:issue,:summary,:memo)');
            $stmt->bindValue(':uid',$uid,SQLITE3_TEXT);
            if($gtid===null)$stmt->bindValue(':gtid',null,SQLITE3_NULL); else $stmt->bindValue(':gtid',$gtid,SQLITE3_INTEGER);
            $stmt->bindValue(':title',$title,SQLITE3_TEXT);
            $stmt->bindValue(':issue',$issue,SQLITE3_TEXT);
            $stmt->bindValue(':summary',$summary,SQLITE3_TEXT);
            $stmt->bindValue(':memo',$memo,SQLITE3_TEXT);
            $stmt->execute();
            $goal_id=$db->lastInsertRowID();
        }else{
            $goal_id=(int)$id;
            $st=$db->prepare('SELECT user_id FROM goals WHERE id=:id');
            $st->bindValue(':id',$goal_id,SQLITE3_INTEGER);
            $re=$st->execute();$ro=$re->fetchArray(SQLITE3_ASSOC);
            if(!$ro||$ro['user_id']!==$uid) throw new RuntimeException('この目標を編集する権限がありません');
            $stmt=$db->prepare('UPDATE goals SET goal_type_id=:gtid,title=:title,issue=:issue,summary=:summary,memo=:memo WHERE id=:id');
            if($gtid===null)$stmt->bindValue(':gtid',null,SQLITE3_NULL); else $stmt->bindValue(':gtid',$gtid,SQLITE3_INTEGER);
            $stmt->bindValue(':title',$title,SQLITE3_TEXT);
            $stmt->bindValue(':issue',$issue,SQLITE3_TEXT);
            $stmt->bindValue(':summary',$summary,SQLITE3_TEXT);
            $stmt->bindValue(':memo',$memo,SQLITE3_TEXT);
            $stmt->bindValue(':id',$goal_id,SQLITE3_INTEGER);
            $stmt->execute();
            $del=$db->prepare('DELETE FROM majors WHERE goal_id=:gid');
            $del->bindValue(':gid',$goal_id,SQLITE3_INTEGER);$del->execute();
        }
        $majors=json_decode($majors_json,true);
        if(is_array($majors)){
            $stmtM=$db->prepare('INSERT INTO majors(goal_id,idx,content,due_term,done) VALUES(:gid,:idx,:content,:due,0)');
            foreach($majors as $m){
                $idx=(int)($m['index'] ?? 0);
                if($idx<=0)continue;
                $content=$m['content'] ?? '';
                $due=$m['due_term'] ?? '上期末';
                $stmtM->bindValue(':gid',$goal_id,SQLITE3_INTEGER);
                $stmtM->bindValue(':idx',$idx,SQLITE3_INTEGER);
                $stmtM->bindValue(':content',$content,SQLITE3_TEXT);
                $stmtM->bindValue(':due',$due,SQLITE3_TEXT);
                $stmtM->execute();
            }
        }
        $db->exec('COMMIT');
        echo json_encode(['ok'=>true]);
    }catch(Throwable $e){
        $db->exec('ROLLBACK');
        http_response_code(400);
        echo json_encode(['error'=>$e->getMessage()]);
    }
}

function handle_delete_goal(SQLite3 $db): void {
  $uid=current_user_id();
  $id=(int)($_POST['id'] ?? 0);
  if($id<=0){echo json_encode(['ok'=>true]);return;}
  $st=$db->prepare('SELECT user_id FROM goals WHERE id=:id');
  $st->bindValue(':id',$id,SQLITE3_INTEGER);
  $re=$st->execute();$ro=$re->fetchArray(SQLITE3_ASSOC);
  if(!$ro||$ro['user_id']!==$uid){http_response_code(403);echo json_encode(['error'=>'この目標を削除する権限がありません']);return;}
  $st=$db->prepare('DELETE FROM goals WHERE id=:id');
  $st->bindValue(':id',$id,SQLITE3_INTEGER);$st->execute();
  echo json_encode(['ok'=>true]);
}

function handle_update_major_done(SQLite3 $db): void {
  $uid=current_user_id();
  $goal_id=(int)($_POST['goal_id'] ?? 0);
  $majors_json=$_POST['majors'] ?? '[]';
  $st=$db->prepare('SELECT user_id FROM goals WHERE id=:id');
  $st->bindValue(':id',$goal_id,SQLITE3_INTEGER);
  $re=$st->execute();$ro=$re->fetchArray(SQLITE3_ASSOC);
  if(!$ro||$ro['user_id']!==$uid){http_response_code(403);echo json_encode(['error'=>'この目標を編集する権限がありません']);return;}
  $updates=json_decode($majors_json,true);
  if(!is_array($updates)){http_response_code(400);echo json_encode(['error'=>'majors が不正です']);return;}
  $stU=$db->prepare('UPDATE majors SET done=:d WHERE goal_id=:gid AND idx=:idx');
  foreach($updates as $u){
    $idx=(int)($u['index'] ?? 0);
    $done=(int)($u['done'] ?? 0);
    if($idx<=0)continue;
    $stU->bindValue(':d',$done,SQLITE3_INTEGER);
    $stU->bindValue(':gid',$goal_id,SQLITE3_INTEGER);
    $stU->bindValue(':idx',$idx,SQLITE3_INTEGER);
    $stU->execute();
  }
  echo json_encode(['ok'=>true]);
}

function handle_get_goal_types(SQLite3 $db): void {
  echo json_encode(['goalTypes'=>fetch_goal_types($db)]);
}
function handle_add_goal_type(SQLite3 $db): void {
  $name=trim($_POST['name'] ?? '');
  if($name===''){http_response_code(400);echo json_encode(['error'=>'目標種別名を入力してください']);return;}
  $st=$db->prepare('INSERT INTO goal_types(name) VALUES(:name)');
  $st->bindValue(':name',$name,SQLITE3_TEXT);$st->execute();
  echo json_encode(['ok'=>true]);
}
function handle_delete_goal_type(SQLite3 $db): void {
  $id=(int)($_POST['id'] ?? 0);
  if($id<=0){echo json_encode(['ok'=>true]);return;}
  $st=$db->prepare('DELETE FROM goal_types WHERE id=:id');
  $st->bindValue(':id',$id,SQLITE3_INTEGER);$st->execute();
  echo json_encode(['ok'=>true]);
}

function fetch_admin_goals(SQLite3 $db): array {
  $sql='SELECT g.*,u.name AS user_name,t.name AS goal_type_name,an.memo AS admin_memo
        FROM goals g JOIN users u ON g.user_id=u.id
        LEFT JOIN goal_types t ON g.goal_type_id=t.id
        LEFT JOIN admin_notes an ON g.id=an.goal_id
        ORDER BY u.id,g.id';
  $res=$db->query($sql);$rows=[];
  while($row=$res->fetchArray(SQLITE3_ASSOC)){
    $row['majors']=fetch_majors($db,(int)$row['id']);
    $rows[]=$row;
  }
  return $rows;
}
function handle_get_admin_goals(SQLite3 $db): void {
  echo json_encode(['adminGoals'=>fetch_admin_goals($db)]);
}

function handle_save_admin_memo(SQLite3 $db): void {
  $goal_id=(int)($_POST['goal_id'] ?? 0);
  $memo=$_POST['memo'] ?? '';
  if($goal_id<=0){http_response_code(400);echo json_encode(['error'=>'goal_id が不正です']);return;}
  $st=$db->prepare('INSERT INTO admin_notes(goal_id,memo) VALUES(:gid,:memo)
                    ON CONFLICT(goal_id) DO UPDATE SET memo=:memo2');
  $st->bindValue(':gid',$goal_id,SQLITE3_INTEGER);
  $st->bindValue(':memo',$memo,SQLITE3_TEXT);
  $st->bindValue(':memo2',$memo,SQLITE3_TEXT);
  $st->execute();
  echo json_encode(['ok'=>true]);
}
