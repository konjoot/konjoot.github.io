---
layout: post
title:  "RESTfull сервис на Go. Часть 3 (Creator - первый хэндлер)."
categories: posts
---

Начнем с базового функционала, хэндлер должен заполнять модель из формы, пришедшей в запросе, сохранять ее, возвращать 201 статус с пустым телом и Location-хэдером, содержащим ссылку на ресурс, а так же корректно отбивать ошибки, если оные возникнут. Соотв. можем набросать следующие кейсы:

  * положительный сценарий:
    - биндим принятую форму на соотв. модель
    - создаем соотв. запись в БД
    - возвращаем 201 статус
    - возвращаем правильный Location-хэдер
    - возвращаем пустое тело ответа
  * негативный сценарий (попытка создать существующую запись):
    - биндим принятую форму на соотв. модель
    - не создаем запись в БД
    - возвращаем 409 статус
    - возвращаем описание ошибки в теле ответа
  * негативный сценарий (неверные параметры):
    - биндим форму
    - не создаем запись в БД
    - возвращаем статус 400
    - возвращаем описание ошибки в теле ответа

Но прежде чем писать тесты нужно определиться с тем как будет организована внутренняя работа ручки, основной здесь вопрос что она будет использовать непосредственно для работы с БД и как будет биндить форму, пришедшую в запросе. Пока считаем, что у нас будет соотв. модель для каждого ресурса, которая будет добавляться в контекст в одной из middleware-функций. Обработка ошибок будет реализована отдельно, поэтому пукты относящиеся к этому функционалу будут реализованы и протестированы в соотв. middleware-обработчике.

Теперь у нас есть все чтобы написать необходимые тесты:

    // reeky/handlers_test.go
    package reeky_test

    import (
      . "github.com/konjoot/reeky/reeky"

      . "github.com/konjoot/reeky/matchers"
      . "github.com/konjoot/reeky/mocks"
      "github.com/konjoot/reeky/test"
      . "github.com/onsi/ginkgo"
      . "github.com/onsi/gomega"
      "net/http"
      "net/http/httptest"
    )

    var _ = Describe("Handlers", func() {
      var (
        form     map[string]string
        context  *echo.Context
        entity   *ResourceMock
        response *httptest.ResponseRecorder
      )

      BeforeEach(func() {
        form = map[string]string{"Name": "Test", "Desc": "TestBoard"}
        response = httptest.NewRecorder()
      })

      Describe("Creator", func() {
        JustBeforeEach(func() {
          request := http.NewRequest("POST", "/tests", test.NewJsonReader(form))
          context := test.Context(request, response, entity)
          Creator(context)
        })

        Describe("positive case", func() {
          BeforeEach(func() {
            entity = &ResourseMock{}
          })

          It("should create entity and return right response", func() {
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).To(BeCreated())
            Expect(response).To(HaveStatus("201"))
            Expect(response).To(HaveHeader("Location").WithUrlFor(entity))
            Expect(response).To(HaveEmptyBody())
            Expect(context).NotTo(HaveErrors())
          })
        })

        Describe("negative case (conflict)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Conflict: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
            Expect(context).To(HaveErrors())
          })
        })

        Describe("negative case (invalid params)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Invalid: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(form).NotTo(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
            Expect(context).To(HaveErrors())
          })
        })

        Describe("negative case (no resorce binded)", func() {
          It("should not create entity and set errors to context", func() {
            Expect(entity).To(BeNil())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
            Expect(context).To(HaveErrors())
          })
        })
      })
    })

Как видно из кода выше, у нас появляется новый пакет test, где будут храниться различные хелперы для тестового окружения, а так же матчеры и моки, которые перенесем туда в одном из следующих рефакторингов, чтобы сделать структуру проекта более прозрачной.

Теперь нужно написать весь вспомогательный функционал, который мы ожидаем в этом тесте:

* создать пакет test с хелперами:
  - Context(req *http.Request, res http.ResponseWriter, r interface{}) (c *echo.Context)
  - NewJsonReader(form interface{}) io.Reader
* написать моку ресурса ResourseMock{}:
  - с полями:
    + Invalid bool
    + Conflict bool
* матчеры:
  - BeBindedTo(...)
  - BeCreated()
  - HaveStatus(...)
  - HaveHeader(...).WithUrlFor(...)
  - HaveEmptyBody()
  - HaveErrors()

Начнем с пакета test:

    //test/helpers.go
    package test

    import (
      "bytes"
      "encoding/json"
      "github.com/labstack/echo"
      "io"
      "net/http"
    )

    func Context(req *http.Request, res http.ResponseWriter, r interface{}) (c *echo.Context) {
      c = echo.NewContext(req, echo.NewResponse(res), echo.New())

      if r != nil {
        c.Set("Resource", r)
      }

      return
    }

    func NewJsonReader(form interface{}) io.Reader {
      jsForm, _ := json.Marshal(form)
      return bytes.NewReader(jsForm)
    }

Теперь займемся матчерами, моку ресурса оставим напоследок, т.к. в процессе написания матчеров будет спроектирован ожидаемый от моки интерфейс.
