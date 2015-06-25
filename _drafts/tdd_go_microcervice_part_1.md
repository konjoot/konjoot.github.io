---
layout: post
title:  "TDD микросервиса на Go. Часть 1"
categories: posts
---

Захотелось на работе продвинуть Go, но слов порой недостаточно, особенно в вопросах выбора языка, поэтому захотелось написать небольшой сервис на Go, на примере которого можно наглядно продемонстрировать процесс разработки на Go, плюс снять бэнчи и т.д.

В этой статье будет рассмотрен процесс создания микросервиса на Go в качестве http-роутера будем использовать gin, для работы с БД (postgres) sqlx и т.к. TDD наше всё, то в довесок к пакету testing, да простит меня Роб Пайк, будет использована замечательная либа ginkgo.

Данное приложение служит одной цели - демонстрация процесса создания RESTfull-сервиса на Go. Соотв. будут рассмотрено то, с чем сталкивается бэкендер большую часть рабочего времени:

* простой ресурс (одна таблица)
* сложный ресурс (несколько таблиц)
* вложенный ресурс (parent\\:id\children)
* вложенный shallow-ресурс (parent\\:id\children\\:id -> children\\:id)
* авторизация
* фильтрация
* пагинация

За основу возьмем замечательный ресурс [trello.com](https://trello.com), соотв. начнем с ресурса boards, и для каждого из пунктов, перечисленных выше, будет выбран подходящий ресурс\набор ресурсов от туда.

Я предполагаю, что рабочее окружение для Go у вас уже настроено, если нет, то вам [сюда](https://golang.org/doc/code.html).

Мое приложение, лежащее в основе сего блога называется reeky, ничего сакрального, просто так получилось. Поэтому проект так же будет носить это имя.

	$ mkdir reeky && cd reeky

Ну и да, я так же предполагаю, что вы используете nix-подобную ОС.

##Тестовое окружение и первый тест##

Для начала ставим ginkgo.

	$ go get github.com/onsi/ginkgo/ginkgo
	$ go get github.com/onsi/gomega
	$ ginkgo bootstrap

После этого у нас появится первый файл в проекте `reeky_suite_test.go`. Теперь пишем первый тест.

	$ ginkgo generate reeky

gomega создаст файл, `reeky_test.go`

	package reeky_test

	import (
		. "github.com/konjoot/reeky"

		. "github.com/onsi/ginkgo"
		. "github.com/onsi/gomega"
	)

	var _ = Describe("Reeky", func() {

	})

 Как видим имя пакета в этом файле reeky_test  и пакет reeky, пока еще не существующий, добавлен как зависимость. Это сделано для того, чтобы изолировать тесты от кода.

 Если сейчас запустить тесты, команда для запуска тестов `ginkgo` или `ginkgo -r` для рекурсивного запуска тестов в директориях проекта; то они упадут с ошибкой:

	no buildable Go source files ...

Чтобы это исправить создадим файл reeky.go следующего содержания:

	package reeky

И напишем наш первый тест. Наше приложение должно запускать gin на указанном порту, поэтому мы можем написать так:

	var _ = Describe("Reeky", func() {
		var (
			app    *App
			engine *EngineMock
			port   string
		)

		BeforeEach(func() {
			port = "8080"
			engine = &EngineMock{}
			app = &App{Engine: engine}
		})

		Describe("RunOn", func() {
			It("should run engine on specified port", func() {
				Expect(engine).NotTo(BeRunning())
				Expect(engine.Port()).To(BeZero())

				app.RunOn(port)

				Expect(engine).To(BeRunning())
				Expect(engine.Port()).To(Equal(":" + port))
			})
		})
	})

Как видно из теста, мы ожидаем, что у нашего приложения будет структура App, с полем Engine, в это поле предполагаем передавать gin.Engine, но для тестов мы будем использовать самописную моку EngineMock. У инстанса `app *App` предполагается наличие метода RunOn, с сигнатурой `func (app * App) RunOn(port string)`.

А так же нам потребуется кастомный матчер BeRunning().

Здесь можно долго дискутировать на тему зачем все эти усложнения с кастомными матчерами, моками и ginkgo, но мое мнение неизменно, хорошо написанного приложения без хорошо написанных, а главное читабельных тестов не существует. Поэтому к написанию тестов я буду предъявлять повышенные требования в ходе дальнейшей работы над проектом.

Для начала нам нужно получить работающий тест. Начнем с матчера BeRunning. Кастомный матчер для gomega должен реализовывать интерфейс:

	type GomegaMatcher interface {
		Match(actual interface{}) (success bool, err error)
		FailureMessage(actual interface{}) (message string)
		NegatedFailureMessage(actual interface{}) (message string)
	}

Матчеры будем хранить в папке `matchers`. В ней создаем файл `be_running.go`:

	package matchers

	import (
		. "github.com/konjoot/reeky/mocks"
		"github.com/onsi/gomega/format"
		"github.com/onsi/gomega/matchers"
	)

	func BeRunning() *beRunningMatcher {
		return &beRunningMatcher{}
	}

	type beRunningMatcher struct{}

	func (m *beRunningMatcher) Match(actual interface{}) (success bool, err error) {
		return (&matchers.BeTrueMatcher{}).Match(actual.(*EngineMock).IsRunning())
	}

	func (m *beRunningMatcher) FailureMessage(actual interface{}) (message string) {
		return format.Message(actual, "to be running")
	}

	func (m *beRunningMatcher) NegatedFailureMessage(actual interface{}) (message string) {
		return format.Message(actual, "not to be running")
}

Теперь займемся мокой, создаем папку `mocks` в ней файл `engine.go`:

	package mocks

	type EngineMock struct {
		port    string
		running bool
	}

	func (e *EngineMock) Run(addr string) (err error) {
		e.port, e.running = addr, true
		return
	}

	func (e *EngineMock) Port() string {
		return e.port
	}

	func (e *EngineMock) IsRunning() bool {
		return e.running
	}


И последнее, чтобы тест заработал создадим App, принимающую в поле Engine указатель на gin.Engine, с пустым методом RunOn() в модуле reeky:

	package reeky

	import (
		"github.com/gin-gonic/gin"
	)

	type App struct {
		Engine *gin.Engine
	}

	func (app *App) RunOn(port string) {}

Теперь наш тест компилируется и его можно запустить:

	Running Suite: Reeky Suite
	==========================
	Random Seed: 1435128182
	Will run 1 of 1 specs

	• Failure [0.001 seconds]
	Reeky
	/home/maksimov/go/src/github.com/konjoot/reeky/reeky_test.go:35
	  RunOn
	  /home/maksimov/go/src/github.com/konjoot/reeky/reeky_test.go:34
	    should run engine on specified port [It]
	    /home/maksimov/go/src/github.com/konjoot/reeky/reeky_test.go:33

	    Expected
	        <*mocks.EngineMock | 0xc20803d140>: {EngineIface: nil, port: "", isRunning: false}
	    to be running

	    /home/maksimov/go/src/github.com/konjoot/reeky/reeky_test.go:31
	------------------------------


	Summarizing 1 Failure:

	[Fail] Reeky RunOn [It] should run engine on specified port 
	/home/maksimov/go/src/github.com/konjoot/reeky/reeky_test.go:31

	Ran 1 of 1 Specs in 0.002 seconds
	FAIL! -- 0 Passed | 1 Failed | 0 Pending | 0 Skipped --- FAIL: TestReeky (0.00s)
	FAIL

##Дработка reeky.App и рефакторинг##

Чтобы наш тест стал зеленым, необходимо доработать метод RunOn следущим образом:

	func (app *App) RunOn(port string) {
		app.Engine.Run(":" + port)
	}

Теперь тест проходит, поэтому займемся рефакторингом. Мы совсем забыли о модуле main, который будет инициализировать и стартовать наше приложение, плюс модуль reeky уже давно направшивается на перенос в отдельную папку. Поэтому создаем папку reeky, куда отправим файлы `reeky.go`, `reeky_suite_test.go` и `reeky_test.go`. В рутовой папке создаем файл main.go следующего содержания:

	package main

	import (
		"github.com/gin-gonic/gin"
		"github.com/konjoot/reeky/reeky"
	)

	func main() {
		app := &reeky.App{Engine: gin.Default()}
		app.RunOn("8080")
	}

Теперь мы можем его скомпилировать командой `go build -o app` и запустить `./app`. Как видим все работает, приложение благополучно запусткает gin на порту 8080.

Т.к. наши тесты из рута переехали в папку reeky, то запускать их нужно командой `ginkgo -r`.

Но пока наше приложение абсолютно бесполезно, т.к. нет ни одного роута и на любой запрос будет ответ 404.

##CRUD boards##

Начнем с реализации ресурса boards, первое, что нам понадобится - это роуты, приступим!

###Тесты роутов###


Создаем файл `reeky/routes_test.go` и пишем тесты:

	package reeky_test

	import (
		"github.com/gin-gonic/gin"
		. "github.com/konjoot/reeky/matchers"
		. "github.com/konjoot/reeky/reeky"
		. "github.com/onsi/ginkgo"
		. "github.com/onsi/gomega"
	)

	var _ = Describe("App", func() {
		var (
			app    *App
			engine *gin.Engine
		)

		BeforeEach(func() {
			gin.SetMode(gin.TestMode)
			engine = gin.New()
			app = &App{Engine: engine}
			app.SetRoutes()
		})

		Describe("Routes", func() {
			It("/boards", func() {
				Expect(engine).To(Handle("GET").On("/boards/:id").By("Getter"))
				Expect(engine).To(Handle("GET").On("/boards").By("ListGetter"))
				Expect(engine).To(Handle("PUT").On("/boards/:id").By("Updater"))
				Expect(engine).To(Handle("POST").On("/boards").By("Creator"))
				Expect(engine).To(Handle("DELETE").On("/boards/:id").By("Destroyer"))
			})
		})
	})


Для работы теста нужно сделать две вещи:

* реализовать матчер Handle()
* создать пустой метод SetRoutes() у `app *App`

Матчер пишем по аналогии с предыдущим, так же в папке `matchers` создаем файл `handle.go`:

	package matchers

	package matchers

	import (
		"github.com/gin-gonic/gin"
		"github.com/onsi/gomega/format"
		"github.com/onsi/gomega/matchers"
	)

	func Handle(method string) *handleMatcher {
		return &handleMatcher{expected: gin.RouteInfo{Method: method}}
	}

	type handleMatcher struct {
		expected gin.RouteInfo
	}

	func (m *handleMatcher) On(path string) *handleMatcher {
		m.expected.Path = path
		return m
	}

	func (m *handleMatcher) By(handler string) *handleMatcher {
		m.expected.Handler = "github.com/konjoot/reeky/reeky." + handler
		return m
	}

	func (m *handleMatcher) Match(actual interface{}) (success bool, err error) {
		return (&matchers.ContainElementMatcher{Element: m.expected}).Match(actual.(*gin.Engine).Routes())
	}

	func (m *handleMatcher) FailureMessage(actual interface{}) (message string) {
		return format.Message(actual.(*gin.Engine).Routes(), "to have route", m.expected)
	}

	func (m *handleMatcher) NegatedFailureMessage(actual interface{}) (message string) {
		return format.Message(actual.(*gin.Engine).Routes(), "not to have route", m.expected)
	}

И добавляем пустой метод SetRoutes в App:

	func (app *App) SetRoutes() (ok bool) {
		return
	}

Тест заработал, теперь дело за самими роутами.
