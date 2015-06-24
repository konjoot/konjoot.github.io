---
layout: post
title:  "TDD микросервиса на Go. Часть 1"
categories: posts
---

В этой статье я проиллюстрирую написание микросервиса на Go в качестве http-роутера будем использовать gin, для работы с БД sqlx и т.к. TDD наше всё, то в довесок к пакету testing, да простит меня Роб Пайк, будет использована замечательная либа ginkgo.

Я предполагаю, что рабочее окружение для Go у вас уже настроено, если нет, то вам [сюда](https://golang.org/doc/code.html).

Мое приложение, лежащее в основе сего блога называется reeky, ничего сакрального, просто так получилось. Поэтому проект так же будет носить это имя.

	$ mkdir reeky && cd reeky

Ну и да, я так же предполагаю, что вы используете nix-подобную ОС.

Тестовое окружение и первый тест
--------------------------------

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

Как видно из теста, мы ожидаем, что у нашего приложения будет структура App, с полем Engine, в это поле в предполагаем передавать gin.Engine, но для тестов мы будем использовать самописную моку EngineMock. У инстанса `app *App` предполагается наличие метода RunOn, с сигнатурой `func (app * App) RunOn(port string)`.

А так же для нам потребуется кастомный матчер BeRunning().

Здесь можно долго дискутировать на тему зачем все эти усложнения с кастомными матчерами, моками и ginkgo, но мое мнение неизменно, хорошо написанного приложения без хорошо написанных, а главное читабельных тестов не существует. Поэтому к написанию тестов я буду предъявлять повышенные требования в ходе дальнейшей работы над проектом.

Для начала нам нужно получить работающий тест. Начнем с матчера BeRunning. Кастомный матчер для gomega должен реализовывать интерфейс:

	type GomegaMatcher interface {
		Match(actual interface{}) (success bool, err error)
		FailureMessage(actual interface{}) (message string)
		NegatedFailureMessage(actual interface{}) (message string)
	}

Так же нам понадобится мока для gin.Engine, гораздо удобней моки и соотв. матчеры хранить в одном файле, поэтому создаем папку `mocks`, в которой будут храниться наши матчеры и моки. И в ней создаем файл `engine.go`, где пока будет только реализация матчера BeRunning:

	package mocks

	import (
		"github.com/onsi/gomega/format"
		"github.com/onsi/gomega/matchers"
	)

	func BeRunning() *beRunningMatcher {
		return &beRunningMatcher{}
	}

	type beRunningMatcher struct{}

	func (m *beRunningMatcher) Match(actual interface{}) (success bool, err error) {
		return (&matchers.BeTrueMatcher{}).Match(actual.(*EngineMock).isRunning)
	}

	func (m *beRunningMatcher) FailureMessage(actual interface{}) (message string) {
		return format.Message(actual, "to be running")
	}

	func (m *beRunningMatcher) NegatedFailureMessage(actual interface{}) (message string) {
		return format.Message(actual, "not to be running")
	}

Теперь осталось написать моку EngineMock, для начала определимся с интерфейсом. Создадим папку interfaces и соотв. файл interfaces.go, куда будем складывать интерфейсы, используемые в нашем приложении:

	package interfaces

	type EngineIface interface{
	  Run(addr string) (err error)
	}

Сейчас наш интерфейс незамысловат, т.к. мы пока хотим только запускать gin на указанном порту.

Теперь займемся мокой:

	package mocks

	import (
		. "github.com/konjoot/reeky/interfaces"
		"github.com/onsi/gomega/format"
		"github.com/onsi/gomega/matchers"
	)

	type EngineMock struct {
		EngineIface
		port      string
		isRunning bool
	}

	func (e *EngineMock) Run(addr string) (err error) {
		e.port, e.isRunning = addr, true
		return
	}

	func (e *EngineMock) Port() string {
		return e.port
	}

И последнее, чтобы тест заработал создадим App, принимающую в поле Engine интерфейс EngineIface, с пустым методом RunOn() в модуле reeky:

	package reeky

	import (
		. "github.com/konjoot/reeky/interfaces"
	)

	type App struct {
		Engine EngineIface
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

Дработка reeky.App и рефакторинг
--------------------------------

todo:

* App.RunOn - допил метода, чтобы тест проходил
* package main и вынос reeky в отдельную папку