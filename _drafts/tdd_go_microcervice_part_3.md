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
            Expect(response.Code).To(Equal(201))
            Expect(response.Header().Get("Location")).To(Equal(entity.Url()))
            Expect(response.Body).To(BeEmpty())
          })
        })

        Describe("negative case (Conflict)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Conflict: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(BeAssignableToTypeOf(ConflictError))
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeNil())
            Expect(response.Body).To(BeEmpty())
          })
        })

        Describe("negative case (Unprocessable Entity)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{Invalid: true}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(BeAssignableToTypeOf(ValidationError))
            Expect(form).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeNil())
            Expect(response.Body).To(BeEmpty())
          })
        })

        Describe("negative case (Unsupported Media Type)", func() {
          BeforeEach(func() {
            entity = &ResourseMock{}
          })

          It("should not create entity and set errors to context", func() {
            Expect(err).To(BeAssignableToTypeOf(echo.UnsupportedMediaType))
            Expect(form).NotTo(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeNil())
            Expect(response.Body).To(BeEmpty())
          })
        })

        Describe("negative case (Failed Dependency)", func() {
          It("should not create entity and set errors to context", func() {
            Expect(err).To(BeAssignableToTypeOf(EmptyResourceError))
            Expect(entity).To(BeNil())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeNil())
            Expect(response.Body).To(BeEmpty())
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

Теперь займемся матчерами:

    // matchers/be_binded_to.go
    package matchers

    import (
      . "github.com/konjoot/reeky/test/interfaces"

      "fmt"
      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeBindedTo(model BindableStringer) *baseMatcher {
      return Matcher(&beBindedToMatcher{model: model})
    }

    type beBindedToMatcher struct {
      model BindableStringer
    }

    func (_ *beBindedToMatcher) Matcher() types.GomegaMatcher {
      return &matchers.BeTrueMatcher{}
    }

    func (m *beBindedToMatcher) Prepare(actual interface{}) interface{} {
      return m.model.BindedWith(actual)
    }

    func (_ *beBindedToMatcher) Format(actual interface{}) string {
      return fmt.Sprintf("%v", actual)
    }

    func (_ *beBindedToMatcher) Message() string {
      return "to be binded to"
    }

    func (m *beBindedToMatcher) String() string {
      return fmt.Sprintf("%v", m.model)
    }


    // matchers/be_created.go
    package matchers

    import (
      . "github.com/konjoot/reeky/test/interfaces"

      "fmt"
      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeCreated() *baseMatcher {
      return Matcher(&beCreatedMatcher{})
    }

    type beCreatedMatcher struct{}

    func (m *beCreatedMatcher) Matcher() types.GomegaMatcher {
      return &matchers.BeTrueMatcher{}
    }

    func (m *beCreatedMatcher) Prepare(actual interface{}) interface{} {
      return actual.(Creatable).Created()
    }

    func (m *beCreatedMatcher) Format(actual interface{}) string {
      return fmt.Sprintf("%v", actual)
    }

    func (_ *beCreatedMatcher) Message() string {
      return "to be created"
    }

    func (_ *beCreatedMatcher) String() (s string) {
      return
    }


Как видим новые матчеры немного отличаются от своих предыдущих собратьев. Отличие в том, что вместо приведения к конкретному типу используются интерфейсы. В случае BeBindedTo-матчера интерфейс BindableStringer принимается в конструктор, а в случае BeCreated-матчера в методе Prepare осуществляется приведение к интерфейсу Creatable. Это сделано, чтобы можно было один и тот же матчер применять к любым типам реализующим ожидаемый интерфейс. Так же у нас в пакете test появился новый пакет interfaces, где будут лежать все интерфейсы, используемые в тестовом окружении, чтобы не мешать их с интерфейсами, используемыми в самом приложении. Все последующие\существующие матчеры будут реализованы\отрефакторены по аналогии с вышеприведенным примером.

# ToDo
Итак, матчеры реализованы, теперь необходимо сделать следующее:

* реализовать моку ResourceMock:
  - с полями:
    + Invalid bool
    + Conflict bool
  - и методами:
    + ...



