---
layout: post
title:  "Работа с массивами в PostgreSQL."
categories: posts
---

pgsql предоставляет довольно мощные инструменты для работы с массивами, что в свою очередь может быть использовано в миграциях данных, чтобы избежать лишних запросов к БД, создания дополнительных таблиц и т.д.

Рассмотрим это на практическом примере. Есть таблицы profiles(профили пользователей), subjects(предметы), competences(компетенции профилей) и education_levels(уровни образования). Исходная схема БД выглядит так:

![Compenences before]({{ site.baseurl }}/images/competences_before.png)

Ее нужно смигрировать к виду:

![Compenences after]({{ site.baseurl }}/images/competences_after.png)


При этом в таблице competences уже есть записи, плюс ко всему для пары profile_id, subject_id может быть несколько записей с разными значениями education_level_id, а так же education_level_id может быть NULL. Так же считаем, что на таблицу competences больше ничего не ссылается и записи в ней могут быть переписаны заново, но сами данные должны остаться.

Я предполагаю, что миграция, добавляющая таблицу competence_education_levels, уже написана и нужно лишь смигрировать данные. Здесь нам на помощь приходит мощь pgsql, позволяя свести к минимуму обращения к БД, реализовав основную логику преобразования данных оперируя массивами и кастомными типами:

<pre class="language-sql line-numbers toggable twisted" placeholder="migration"><code>
DROP TYPE IF EXISTS DATA;
DROP TYPE IF EXISTS NDATA;
DROP TYPE IF EXISTS CE_DATA;
CREATE TYPE DATA AS (subject_id INT, profile_id INT, education_level_ids INT[]);
CREATE TYPE NDATA AS (competence_id INT, subject_id INT, profile_id INT);
CREATE TYPE CE_DATA AS (competence_id INT, education_level_id INT);

CREATE OR REPLACE FUNCTION do_work() RETURNS void AS

$BODY$
DECLARE
  id      INT;
  p_id    INT;
  el_id   INT;
  subj_id INT;
  el_ids  INT[];
  d       DATA[]; -- оригинальные данные из таблицы competences
  nd      NDATA[]; -- данные по новым компетенциям
  ced     CE_DATA[]; -- данные для таблицы competence_education_levels
BEGIN
  -- выбираем данные из раблицы competences
  d := ARRAY(
    SELECT ROW(subject_id, profile_id, (
      SELECT ARRAY_AGG(education_level_id)
      FROM competences AS cc
      WHERE c.subject_id = cc.subject_id AND c.profile_id = cc.profile_id))
    FROM competences AS c GROUP BY subject_id, profile_id, education_level_id
  );

  -- создаем новые записи в таблице competences и сохраняя, что получилось, в nd
  WITH ns AS (
    INSERT INTO competences (subject_id, profile_id)
      SELECT subject_id, profile_id
      FROM UNNEST(d) returning *
    ) SELECT ARRAY_AGG(ROW(ns.id, ns.subject_id, ns.profile_id)) FROM ns INTO nd;

  -- бежим по полученной коллекции и подготавливаем массив ced
  -- для заполнения таблицы competence_education_levels
  FOREACH id, subj_id, p_id IN ARRAY nd LOOP
    SELECT ARRAY_REMOVE(education_level_ids, NULL)
      FROM UNNEST(d)
      WHERE subject_id = subj_id AND profile_id = p_id INTO el_ids;
    IF ARRAY_LENGTH(el_ids, 1) IS NOT NULL THEN
      FOREACH el_id IN ARRAY(el_ids) LOOP
        SELECT ARRAY_APPEND(ced, CAST(ROW(id, el_id) AS CE_DATA)) INTO ced;
      END LOOP;
    END IF;
  END LOOP;

  -- добавляем записи в таблицу competence_education_levels из массива ced
  INSERT INTO competence_education_levels (competence_id, education_level_id)
    SELECT competence_id, education_level_id FROM UNNEST(ced);

  -- удаляем старые записи из таблицы competences
  DELETE FROM competences
    WHERE competences.id NOT IN (
      SELECT competence_id FROM UNNEST(nd)
    );

  RETURN;
END
$BODY$
LANGUAGE plpgsql;

BEGIN;
SELECT do_work();
COMMIT;
</code></pre>

Итого получаем один селект из competences, два инсёрта в competences и competence_education_levels и делит из competences старых записей. FUCK YEAH!

# ToDo

* проаннотировать каждый шаг в скрипте
* нарисовать нормальную схему БД с помощью dia и вставить сюда картинкой
