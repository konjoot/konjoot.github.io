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

Тестовое окружение и первые тесты
-------

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

И написать наш первый тест. Наше приложение должно запускать gin на указанном порту, поэтому мы можем написать так:

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

Для начала нам нужно получить работающий тест.
Начнем с матчера...
