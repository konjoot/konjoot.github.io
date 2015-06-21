---
layout: post
title:  "TDD микросервиса на Go. Часть 1."
categories: posts
---

Рефакторинг матчеров
--------------------

Теперь у нас  матчеров:

* beCreatedMatcher
* haveHeaderMatcher
* bindedWithMatcher
* isRunningMatcher
* handleMatcher

routeMatcher я переименовал в handleMatcher для унификации имен матчеров в проекте. При внимательном взгляде на матчеры, заметно, что код в них выглядит грязно. Это в первую очередь касается методов `Match()`, `FailureMessage()` и `NegatedFailureMessage`. Предыдущих коммитах стало вырисовываться некоторая однотипность в них и сейчас это можно резюмировать следующим кодом:


	type Matcher struct{ MatcherInterface }
	
	func (m *Matcher) Match(actual interface{}) (success bool, err error) {
	  return m.Matcher().Match(m.Prepare(actual))
	}
	
	func (m *Matcher) FailureMessage(actual interface{}) (message string) {
	  return fmt.Sprintf("Expected %s\n\t%s", m.Format(actual), m.Message())
	}
	
	func (m *Matcher) NegatedFailureMessage(actual interface{}) (message string) {
	  return fmt.Sprintf("Expected %s\n\tnot %s", m.Format(actual), m.Message())
	}


Как видно из вышеприведенного примера чтобы мы могли легко добавить эти методы к матчеру, нужно вынести их в отдельную структуру и подмешивать ее к каждому из наших кастомных матчеров, а чтобы подмешанные методы могли работать сами матчеры должны реализовывать интерфейс:


	import "github.com/onsi/gomega/types"
	
	type MatcherInterface interface {
		Matcher() types.GomegaMatcher
		Prepare(actual interface{}) interface{}
		Format(actual interface{}) string
		Message() string
	}

Поэтому мы опишем этот интерфейс и перепишем конструкторы как-то так:


	type BeCreatedMatcher struct {}
	
	func BeCreated() *Matcher {
	  return &Matcher{BeCreatedMatcher}
	}

Тем самым мы явно обозначаем, что любой кастомный матчер состоит из двух составляющих: методов из BaseMatcher (общая для всех матчеров функциональность) и уникальная часть матчера, которая должна реализовывать интерфейс MatcherInterface.

Соотв. создаем новый модуль `matchers` в котором будет лежать код для наших матчеров: MatcherInterface, Matcher{}.

Что ж все в этом красиво, но в конструкторах по-прежнему дублируется код. А если со временем мы решим поменять работу конструкторов, нам тогда придется во всех местах это править. Поэтому, нужно придумать как нам этого избежать.  Пока на ум приходит следующий вариант: так же в модуле `matchers` создаем функцию Matcher, которая принимает MatcherInterface и возвращает *Matcher:


	func Matcher(m MatcherInterface) *BaseMatcher {
	  return &BaseMatcher{m}
	}

Только для этого придется еще переименовать тип `Matcher` в `BaseMatcher` (.

Чтож, теперь только осталось применить эти изменения для всех остальных матчеров.

Отрефакторил матчеры, для сложных матчеров, типа `handlerMatcher` пришлось возвращать *BaseMatcher из последнего метода, иначе часть его методов экранировалась интерфейсом `MatcherInterface`.
Так же отрефакторил `matchers.go`, теперь методы объекта BaseMatcher выглядят так:



	type BaseMatcher struct{ MatcherInterface }
	
	func (m *BaseMatcher) Match(actual interface{}) (success bool, err error) {
		return m.Matcher().Match(m.Prepare(actual))
	}
	
	func (m *BaseMatcher) FailureMessage(actual interface{}) string {
		return fmt.Sprintf(m.Template(false), m.Format(actual), m.Message())
	}
	
	func (m *BaseMatcher) NegatedFailureMessage(actual interface{}) string {
		return fmt.Sprintf(m.Template(true), m.Format(actual), m.Message())
	}
	
	func (m *BaseMatcher) Template(negate bool) (s string) {
		s = "Expected\n\t%s\n"
	
		if negate {
			s += "not "
		}
	
		s += "%s"
	
		if str := m.String(); len(str) > 0 {
			s += fmt.Sprintf("\n\t%s", str)
		}
	
		return
	}

Соотв. функционал кастомных матчеров полностью унифицирован, дублирование кода сведено к минимуму. Так же пришлось расширить `MatcherInterface` методом `String()`, возвращающим строковое представление матчера для отображения в соотщениях.

Теперь можно переходить к написанию первого рабочего кода хэндлера `Creator`.
При написании тестов к Creator-у вырисовалась схема работы хэндлера с ресурсом и контекстом, пока это выглядит следующим образом:

* ручка получает запрос
* биндит прилетевшую форму в структуру, возвращаемую ресурсом
* сохраняет ресурс
* отдает 201 статус с заголовком Location, где указан урл, вновь созданного ресурса.

Пока нас не заботят ни внутренности ресурса, ни то, как этот ресурс будет попадать в контекст `gin.Context`.

Поэтому код Creator-a будет таким:

	func Creator(c *gin.Context) {
		r, _ := c.Get("resource")
		
		c.Bind(r.Form())
		r.Save()
		c.Header("Location", r.Url())
		c.Data(http.StatusCreated, gin.MIMEJSON, nil)
	}


Однако, если мы сейчас запустим тесты они не скомпилятся т.к. `c.Get("resource")` возвращает тип `interface{}`. Соотв. чтобы это заработало, нам потребуется явное приведение типа к интерфейсу, который нам нужен. Судя по вышеприведенному коду пока у ресурса довольно простой интерфейс:


	type ResourceIface interface {
		Form() interface{}
		Url() string
		Save()
	}


Нашел баг в коде, подготавливающем тестовое окружение для ручки `Creator`:


	var _ = Describe("Handlers", func() {
		var (
			router   *gin.Engine
			response *httptest.ResponseRecorder
			request  *http.Request
			resource *ResourceMock
			body     map[string]string
			cType    string
		)
	
		BeforeEach(func() {
			gin.SetMode(gin.TestMode)
			router = gin.New()
			response = httptest.NewRecorder()
			cType = gin.MIMEJSON
		})
	
		Describe("Creator", func() {
			JustBeforeEach(func() {
				router.POST("/tests", Creator)
				router.Use(func(c *gin.Context) {
					c.Set("resource", resource)
				})
				jsBody, _ := json.Marshal(body)
				request, _ = http.NewRequest("POST", "/tests", bytes.NewBuffer(jsBody))
				request.Header.Add("Content-Type", cType)
	
				router.ServeHTTP(response, request)
			})
	
			Context("on success", func() {
				BeforeEach(func() {
					resource = Resource()
					body = map[string]string{
						"Name": "test",
						"Desc": "testDesc"}
				})
				...
			})
		})
	})


Проблема здесь в том, что мы я не правильно подготавливал `gin.Context`, планировалось, что в `middleware` будет сеттиться  `resource`, однако код:


	 router.Use(func(c *gin.Context) {
	    c.Set("resource", resource)
	})

Всегда выставлял `resource` в `nil`. Это связано с тем, что переменная `resource` доступна в лямбде, передаваемой методу `router.Use()` получает доступ к переменной `resource` средствами замыкания, а на момент инициализации лямбды в замыкание попало нулевое значение переменной `resource`, в данном случае `nil`.

Следовательно код, приведенный выше нужно переместить в ту функцию, где происходит присваивание значения, сразу после присваивания:


	BeforeEach(func() {
	  resource = Resource()
	  router.Use(func(c *gin.Context) {
	    c.Set("resource", resource)
	  })
	  body = map[string]string{
	    "Name": "test",
	    "Desc": "testDesc"}
	})

После имплементации ручки:

	func Creator(c *gin.Context) {
		r, _ := c.Get("resource")
		ri := r.(ResourceIface)
		
		c.Bind(r.Form())
		r.Save()
		
		c.Header("Location", r.Url())
		c.Data(http.StatusCreated, gin.MIMEJSON, nil)
	}

Тесты для успешного сценария стали проходить, однако часть пустых тестов стали падать с паникой. Это связано с тем, что в ручке происходит приведение типа и ни как не обрабатывается тот случай, когда ресурса в контексте нет. Это нужно исправить.

Пока негативные тесты не написаны не будем мудрствовать лукаво, и перепишем ручку так:

	func Creator(c *gin.Context) {
		if r, ok := c.Get("resource"); ok {
			ri := r.(ResourceIface)
			
			c.Bind(r.Form())
			r.Save()
			
			c.Header("Location", r.Url())
			c.Data(http.StatusCreated, gin.MIMEJSON, nil)
		}
	}

Здесь все, теперь займемся негативными сценариями Creator-a.	





