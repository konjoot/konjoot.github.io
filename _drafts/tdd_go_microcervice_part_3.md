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
    - возвращаем 409 (Conflict)
    - возвращаем описание ошибки в теле ответа
  * негативный сценарий (неверные параметры, ошибка валидации):
    - биндим форму
    - не создаем запись в БД
    - возвращаем статус 422 (Unprocessable Entity)
    - возвращаем описание ошибки в теле ответа
  * негативный сценарий (неверные параметры, невозможно декодировать тело запроса):
    - не биндим форму
    - не создаем запись в БД
    - возвращаем статус 415 (Unsupported Media Type)
    - возвращаем описание ошибки в теле ответа
  * негативный сценарий (не найдена соответствующая модель):
    - не биндим форму
    - не создаем запись в БД
    - возвращаем статус 424 (Failed Dependency)
    - возвращаем описание ошибки в теле ответа

Но прежде чем писать тесты нужно определиться с тем как будет организована внутренняя работа ручки, основные вопросы здесь в том, что она будет использовать непосредственно для работы с БД и как будет биндить форму, пришедшую в запросе, а так же как будет осуществляться обработка ошибок. Пока остановимся на следующем варианте работы:

* парсим переданные параметры
* биндим их в модель
* сохраняем модель (валидация формы будет производиться на стороне модели)
* возвращаем статус 201
* и соотв. Location-хэдер
* на каждом этапе проверяем наличие ошибки
* при появлении оной прерываем выполнение и возвращаем ее

В echo есть middleware-обработчик Logger(), который получив ошибку типа HTTPError применяет к ней стандартный обработчик ошибок, а в противном случае 500-ю ошибку. Поэтому на это можно не заморачиваться, а нам останется написать только middleware-конвертор ошибок, который будет конвертировать ошибки, приходящие их хэндлеров, в HTTPErrors. Благодаря этому у нас будет унифицирована конвертация\обработка ошибок. Что касается неперехваченных паник, то за это отвечает echo-кий Recover().

Т.е. код Creator-a будет примерно такой:

    func Creator(c *echo.Context) (e error) {

      resource := c.Get("resource")

      if resource == nil {
        return NewEmptyResourseError()
      }

      if e = c.Bind(resource); e != nil {
        return
      }

      if e = resource.Save(); e != nil {
        return
      }

      if e = SetHeader(c, Location(resource)); e != nil {
        return
      }

      if e = c.JSON(http.StatusCreated); e != nil {
        return
      }

      return
    }

Теперь у нас есть все чтобы написать необходимые тесты:

    // reeky/handlers_test.go
    package reeky_test

    import (
      . "github.com/konjoot/reeky/reeky"
      "github.com/labstack/echo"

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
        err      error
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
          err := Creator(context)
        })

        Describe("positive case", func() {
          BeforeEach(func() {
            entity = &ResourseMock{}
          })

          It("should create entity and return right response", func() {
            Expect(err).To(BeNil())
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).To(BeCreated())
            Expect(response).To(HaveStatus("201"))
            Expect(response).To(HaveHeader("Location").WithUrlFor(entity))
            Expect(response).To(HaveEmptyBody())
          })
        })

        Describe("negative case (Conflict)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Conflict: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(HaveType(ConflictError))
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
          })
        })

        Describe("negative case (Unprocessable Entity)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Invalid: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(HaveType(ValidationError))
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
          })
        })

        Describe("negative case (Unsupported Media Type)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(HaveType(echo.UnsupportedMediaType))
            Expect(form).NotTo(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
            Expect(context).To(HaveErrors())
          })
        })

        Describe("negative case (Failed Dependency)", func() {
          It("should not create entity and set errors to context", func() {
            Expect(err).To(HaveType(EmptyResourceError))
            Expect(entity).To(BeNil())
            Expect(response).NotTo(HaveStatus("201"))
            Expect(response).NotTo(HaveHeader("Location"))
            Expect(response).To(HaveEmptyBody())
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
  - HaveType(...)

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
Итак, начнем с BeBindedTo(...)

    // matchers/be_binded_to.go
    package matchers

    import (
      . "github.com/konjoot/reeky/mocks"
      . "github.com/konjoot/reeky/mocks/interfaces"

      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeBindedTo() *beBindedToMatcher {
      return Matcher(&beBindedToMatcher{})
    }

    type beBindedToMatcher struct{}

    func (m *beBindedToMatcher) Matcher() types.GomegaMatcher {
      return &matchers.BeTrueMatcher{}
    }

    func (m *beBindedToMatcher) Prepare(actual interface{}) interface{} {
      return actual.(Bindable).Binded()
    }

    func (m *beBindedToMatcher) Format(actual interface{}) string {
      return actual.(Stringer).String()
    }

    func (_ *beBindedToMatcher) Message() string {
      return "to be binded"
    }

    func (_ *beBindedToMatcher) String() (s string) {
      return
    }

Этот матчер отличается от всех предыдущих тем, что в методах Prepare и Format параметр actual явно приводится к интерфейсу, а не к конкретному типу, как в прошлых примерах, это сделано, чтобы можно было один и тот же матчер применять к любым типам реализующим ожидаемый интерфейс. Так же у нас в пакете matchers появится новый пакет interfaces, где будут лежать все интерфейсы, используемые в тестовом окружении, чтобы не мешать их с интерфейсами, используемыми в самом приложении. Все последующие\существующие матчеры будут реализованы\отрефакторены по аналогии с вышеприведенным примером.

Итак, матчеры реализованы, теперь необходимо сделать следующее:

* создать пакет matchers/interfaces, где опишем необходимые интерфейсы:
  - Bindable
  - Stringer
  - ...
* реализовать моку ResourceMock:
  - с полями:
    + Invalid bool
    + Conflict bool
  - и методами:
    + ...


# ToDo
В нужно отрефакторить все матчеры таким образом, чтобы они принимали интерфейсы, для полиморфизма и т.п. поэтому в новых матчерах начнем уже это реализовывать, но сначала нужно обедиться, что схема рабочая, т.е. нужно проверить, что код:

    func Test(i interface{}){
      TestMe(i.(runner))
    }

    func TestMe(r runner) {
      r.Run()
    }

    type runner interface {
      Run()
    }

    type RR struct {}

    func (_ *RR) Run() {
      fmt.Println("Running")
    }

Будет работать. Да код работает!