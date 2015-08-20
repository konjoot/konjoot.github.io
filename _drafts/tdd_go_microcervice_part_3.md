---
layout: post
title:  "RESTfull сервис на Go. Часть 3 (Creator - первый хэндлер)."
categories: posts
---

# Тесты

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

      if e = c.Bind(resource.Form()); e != nil {
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
      "io"
      "net/http"
      "net/http/httptest"

      . "github.com/konjoot/reeky/errors"
      . "github.com/konjoot/reeky/matchers"
      . "github.com/konjoot/reeky/mocks"
      . "github.com/konjoot/reeky/reeky"
      . "github.com/onsi/ginkgo"
      . "github.com/onsi/gomega"

      "github.com/konjoot/reeky/test"
      "github.com/labstack/echo"
    )

    var _ = Describe("Handlers", func() {
      var (
        err      error
        body     io.Reader
        fMap     map[string]string
        form     interface{}
        entity   *ResourceMock
        response *httptest.ResponseRecorder
      )

      BeforeEach(func() {
        fMap = map[string]string{"Name": "Test", "Desc": "TestDesc"}
        body = test.NewJsonReader(fMap)
        form = test.Form()
        response = httptest.NewRecorder()
      })

      Describe("Creator", func() {
        JustBeforeEach(func() {
          request, _ := http.NewRequest("POST", "/tests", body)
          context := test.Context(request, response, entity)
          err = Creator(context)
        })

        Describe("positive case", func() {
          BeforeEach(func() {
            entity = &ResourceMock{Form: form}
          })

          It("should create entity and return right response", func() {
            Expect(err).To(BeNil())
            Expect(fMap).To(BeBindedTo(entity))
            Expect(entity).To(BeCreated())
            Expect(response.Code).To(Equal(201))
            Expect(response.Header().Get("Location")).To(Equal(entity.Url()))
            Expect(response.Body.Len()).To(BeZero())
          })
        })

        Describe("negative case (Conflict)", func() {
          BeforeEach(func() {
            entity = &ResourceMock{Form: form, Conflict: true}
          })

          It("should not create entity and return ConflictError", func() {
            Expect(err).To(BeTypeOf(ConflictError{}))
            Expect(fMap).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeEmpty())
            Expect(response.Body.Len()).To(BeZero())
          })
        })

        Describe("negative case (Unprocessable Entity)", func() {
          BeforeEach(func() {
            entity = &ResourceMock{Form: form, Invalid: true}
          })

          It("should not create entity and return ValidationError", func() {
            Expect(err).To(BeTypeOf(ValidationError{}))
            Expect(fMap).To(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeEmpty())
            Expect(response.Body.Len()).To(BeZero())
          })
        })

        Describe("negative case (Unsupported Media Type)", func() {
          BeforeEach(func() {
            body = test.NewStringReader("bad request")
            entity = &ResourceMock{Form: form}
          })

          It("should not create entity and return UnsupportedMediaType error", func() {
            Expect(err).To(BeTypeOf(echo.UnsupportedMediaType))
            Expect(fMap).NotTo(BeBindedTo(entity))
            Expect(entity).NotTo(BeCreated())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeEmpty())
            Expect(response.Body.Len()).To(BeZero())
          })
        })

        Describe("negative case (Failed Dependency)", func() {
          It("should not create entity and return EmptyResourceError", func() {
            Expect(err).To(BeTypeOf(EmptyResourceError{}))
            Expect(entity).To(BeNil())
            Expect(response.Code).NotTo(Equal(201))
            Expect(response.Header().Get("Location")).To(BeEmpty())
            Expect(response.Body.Len()).To(BeZero())
          })
        })
      })
    })




Как видно из кода выше, у нас появляется новый пакет test, где будут храниться различные хелперы для тестового окружения, а так же матчеры и моки, которые перенесем туда в одном из следующих рефакторингов, чтобы сделать структуру проекта более прозрачной.

Теперь нужно написать весь вспомогательный функционал, который мы ожидаем в этом тесте:

* создать пакет test с хелперами:
  - Context(*http.Request, http.ResponseWriter, interface{}) *echo.Context
  - NewJsonReader(interface{}) io.Reader
  - NewStringReader(string) io.Reader
  - Form() interface{}
* написать моку ресурса ResourseMock{}:
* матчеры:
  - BeBindedTo(...)
  - BeCreated()
  - BeTypeOf(...)

Начнем с пакета test:

    //test/helpers.go
     package test

    import (
      "bytes"
      "encoding/json"
      "io"
      "net/http"
      "strings"

      "github.com/labstack/echo"
    )

    type testForm struct {
      Name string
      Desc string
    }

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

    func NewStringReader(s string) io.Reader {
      return strings.NewReader(s)
    }

    func Form() *testForm {
      return &testForm{}
    }


Теперь займемся матчерами:

    // matchers/be_binded_to.go
    package matchers

    import (
      "fmt"

      . "github.com/konjoot/reeky/interfaces"
      . "github.com/konjoot/reeky/test/interfaces"

      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    type modelIface interface {
      Bindable
      Stringer
    }

    func BeBindedTo(model modelIface) *baseMatcher {
      return Matcher(&beBindedToMatcher{model: model})
    }

    type beBindedToMatcher struct {
      model modelIface
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
      . "github.com/konjoot/reeky/interfaces"
      . "github.com/konjoot/reeky/test/interfaces"

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
      return actual.(Stringer).String()
    }

    func (_ *beCreatedMatcher) Message() string {
      return "to be created"
    }

    func (_ *beCreatedMatcher) String() (s string) {
      return
    }



    // matchers/be_type_of.go
    package matchers

    import (
      "fmt"
      "reflect"

      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeTypeOf(ex interface{}) *baseMatcher {
      return Matcher(&beTypeOfMatcher{expected: ex})
    }

    type beTypeOfMatcher struct {
      expected interface{}
    }

    func (m *beTypeOfMatcher) Matcher() types.GomegaMatcher {
      return &matchers.EqualMatcher{Expected: reflect.TypeOf(m.expected)}
    }

    func (_ *beTypeOfMatcher) Prepare(actual interface{}) interface{} {
      return reflect.TypeOf(actual)
    }

    func (_ *beTypeOfMatcher) Format(actual interface{}) string {
      return fmt.Sprintf("%v", reflect.TypeOf(actual))
    }

    func (_ *beTypeOfMatcher) Message() string {
      return "to be type of"
    }

    func (m *beTypeOfMatcher) String() string {
      return fmt.Sprintf("%v", reflect.TypeOf(m.expected))
    }


Как видим новые матчеры немного отличаются от своих предыдущих собратьев. Отличие в том, что вместо приведения к конкретному типу используются интерфейсы. В случае BeBindedTo-матчера интерфейс modelIface принимается в конструктор, а в случае BeCreated-матчера в методе Prepare осуществляется приведение к интерфейсу Creatable. Это сделано, чтобы можно было один и тот же матчер применять к любым типам реализующим ожидаемый интерфейс. Так же у нас в пакете test появился новый пакет interfaces, где будут лежать все интерфейсы, используемые в тестовом окружении, чтобы не мешать их с интерфейсами, используемыми в самом приложении. Все последующие\существующие матчеры будут реализованы\отрефакторены по аналогии с вышеприведенным примером.

Так же создаем в корне проекта папку errors и создаем там три файлика с описанием наших кастомных типов ошибок, пока это скорее прототипы, детализация этих типов будет осуществлена позднее в процессе непосредственной реализации хэндлеров и моделей.

    // errors/conflict.go
    package errors

    type ConflictError struct{}

    func (e *ConflictError) Error() string {
      return "ConflictError"
    }



    // errors/empty_resource.go
    package errors

    type EmptyResourceError struct{}

    func (e *EmptyResourceError) Error() string {
      return "EmptyResourceError"
    }



    // errors/validation.go
    package errors

    type ValidationError struct{}

    func (e *ValidationError) Error() string {
      return "ValidationError"
    }


Теперь у нас все готово для реализации самого функционала ручки Creator.

# Реализация

