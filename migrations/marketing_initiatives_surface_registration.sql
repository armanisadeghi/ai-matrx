insert into ui.ui_surface(name,client_name,description,sort_order,url_pattern,label,readiness,readiness_note)
values ('matrx-user/marketing-initiatives','matrx-user','Marketing initiative portfolio and detail',360,'/marketing/initiatives*','Marketing Initiatives','partial','Manifest, route mapping, and list/detail emitters are wired; live binding verification remains.')
on conflict(name) do update set url_pattern=excluded.url_pattern,label=excluded.label,readiness=excluded.readiness,readiness_note=excluded.readiness_note;
