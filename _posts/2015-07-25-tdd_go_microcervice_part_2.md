---
layout: post
title:  "RESTfull сервис на Go. Часть 2 (Первые роуты)."
categories: posts
---

Начнем с реализации ресурса boards, первое, что нам понадобится - это роуты, приступим!

#Тесты#

Создаем файл `reeky/routes_test.go` и пишем тесты:

    package reeky_test

    import (
      . "github.com/konjoot/reeky/matchers"
      . "github.com/konjoot/reeky/reeky"
      "github.com/labstack/echo"
      . "github.com/onsi/ginkgo"
      . "github.com/onsi/gomega"
    )

    var _ = Describe("App", func() {
      var (
        app    *App
        engine *echo.Echo
      )

      BeforeEach(func() {
        engine = echo.New()
        app = &App{Engine: engine}
        app.Setup()
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
* создать пустой метод Setup() у `app *App`

Матчер пишем по аналогии с предыдущим, так же в папке `matchers` создаем файл `handle.go`:

    package matchers

    import (
      "github.com/labstack/echo"
      "github.com/onsi/gomega/format"
      "github.com/onsi/gomega/matchers"
    )

    func Handle(method string) *handleMatcher {
      return &handleMatcher{expected: echo.Route{Method: method}}
    }

    type handleMatcher struct {
      expected echo.Route
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
      return (&matchers.ContainElementMatcher{Element: m.expected}).Match(actual.(*echo.Echo).Routes())
    }

    func (m *handleMatcher) FailureMessage(actual interface{}) (message string) {
      return format.Message(actual.(*echo.Echo).Routes(), "to have route", m.expected)
    }

    func (m *handleMatcher) NegatedFailureMessage(actual interface{}) (message string) {
      return format.Message(actual.(*echo.Echo).Routes(), "not to have route", m.expected)
    }

И добавляем пустой метод Setup в App:

    func (app *App) Setup() (ok bool) {
      return
    }

Тест заработал, теперь дело за самими роутами.

Так же нам нужно гарантировать, что приложение выполняет настройку роутов перед запуском, поэтому доработаем тест `reeky_test.go`:

    package reeky_test

    import (
      . "github.com/konjoot/reeky/matchers"
      . "github.com/konjoot/reeky/mocks"
      . "github.com/konjoot/reeky/reeky"

      . "github.com/onsi/ginkgo"
      . "github.com/onsi/gomega"
    )

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
          Expect(app).NotTo(BeOk())
          Expect(engine.Port()).To(BeZero())

          app.RunOn(port)

          Expect(engine).To(BeRunning())
          Expect(app).To(BeOk())
          Expect(engine.Port()).To(Equal(":" + port))
        })
      })
    })

Теперь дело за кастомным матчером `BeOk()`:

    package matchers

    import (
      . "github.com/konjoot/reeky/reeky"
      "github.com/onsi/gomega/format"
      "github.com/onsi/gomega/matchers"
    )

    func BeOk() *beOkMatcher {
      return &beOkMatcher{}
    }

    type beOkMatcher struct{}

    func (m *beOkMatcher) Match(actual interface{}) (success bool, err error) {
      return (&matchers.BeTrueMatcher{}).Match(actual.(*App).Ok)
    }

    func (m *beOkMatcher) FailureMessage(actual interface{}) (message string) {
      return format.Message(actual, "to have status Ok")
    }

    func (m *beOkMatcher) NegatedFailureMessage(actual interface{}) (message string) {
      return format.Message(actual, "not to have status Ok")
    }

Как видно из матчера у структуры App мы ожидаем наличие экспортируемого поля Ok, которое будет содержать статус настройки приложения, соотв. если настройка не произведена или завершилась с ошибкой в нем будет false.

Доработаем `App`, чтобы тест прошел:

    type App struct {
      Ok     bool
      Engine EngineIface
    }

    func (app *App) RunOn(port string) {
      app.Setup()
      app.Engine.Run(":" + port)
    }

    func (app *App) Setup() (ok bool) {
      app.Ok, ok = true, true
      return
    }


#Роуты#

Создаем файл `reeky/routes.go`, куда переносим метод Setup() и дописываем его, чтобы тест проходил:

    package reeky

    func (app *App) Setup() (ok bool) {
      app.Engine.Get("/boards/:id", Getter)
      app.Engine.Get("/boards", ListGetter)
      app.Engine.Put("/boards/:id", Updater)
      app.Engine.Post("/boards", Creator)
      app.Engine.Delete("/boards/:id", Destroyer)
      app.Ok, ok = true, true
      return
    }

Расширяем интерфейс EngineIface, чтобы перечисленные методы, были доступны в сруктуре App:

    package interfaces

    import (
      "github.com/labstack/echo"
    )

    type EngineIface interface {
      Run(addr string)
      Get(path string, h echo.Handler)
      Put(path string, h echo.Handler)
      Post(path string, h echo.Handler)
      Delete(path string, h echo.Handler)
    }

И добавляем эти методы в EngineMock:

    package mocks

    import "github.com/labstack/echo"
    ...
    func (e *EngineMock) Get(path string, h echo.Handler)    {}
    func (e *EngineMock) Put(path string, h echo.Handler)    {}
    func (e *EngineMock) Post(path string, h echo.Handler)   {}
    func (e *EngineMock) Delete(path string, h echo.Handler) {}

А так же создаем файл `reeky/handlers.go`, где объявляем наши, пока пустые, ручки:

    package reeky

    import "github.com/labstack/echo"

    func ListGetter(c *echo.Context) (err error) {
      return
    }

    func Getter(c *echo.Context) (err error) {
      return
    }

    func Creator(c *echo.Context) (err error) {
      return
    }

    func Updater(c *echo.Context) (err error) {
      return
    }

    func Destroyer(c *echo.Context) (err error) {
      return
    }

Теперь тест проходит. Однако, если скомпилировать и запустить приложение, в консоли не появится абсолютно ничего, приложение хранит полное молчание, самое время воспользоваться middleware, которое заботливо предоставляет Echo:

    // reeky/routes.go
    package reeky

    import mw "github.com/labstack/echo/middleware"

    func (app *App) Setup() (ok bool) {
      // Middleware
      app.Engine.Use(mw.Logger())
      app.Engine.Use(mw.Recover())

      // Routes
      app.Engine.Get("/boards/:id", Getter)
      app.Engine.Get("/boards", ListGetter)
      app.Engine.Put("/boards/:id", Updater)
      app.Engine.Post("/boards", Creator)
      app.Engine.Delete("/boards/:id", Destroyer)
      app.Ok, ok = true, true
      return
    }

Так же потребуется расширить EngineIface и EngineMock новым методом Use.
Теперь все работает. Осталось написать соотв. ручки. Но сначала рефакторинг.

#Рефакторинг#

Два момента в приложении требуют переработки:

* метод Setup нужно разделить на несколько методов
* поле Ok превратить в метод и возвращать там общий статус приложения: роуты настроены, middleware подключено и т.д.
* работу с матчерами стоит унифицировать

Что касается метода Setup, то напрашивается разделение этого метода на две части и вынос этих частей в отдельные файлы. Сделаем это следующим образом:

     type beOkMatcher struct{}

     func (m *beOkMatcher) Match(actual interface{}) (success bool, err error) {
    -       return (&matchers.BeTrueMatcher{}).Match(actual.(*App).Ok)
    +       return (&matchers.BeTrueMatcher{}).Match(actual.(*App).Ok())
     }

    +++ b/reeky/middleware.go
    @@ -0,0 +1,9 @@
    +package reeky
    +
    +import mw "github.com/labstack/echo/middleware"
    +
    +func (app *App) SetMiddleWare() bool {
    +       app.Engine.Use(mw.Logger())
    +       app.Engine.Use(mw.Recover())
    +       return true
    +}

     type App struct {
    -       Ok     bool
    -       Engine EngineIface
    +       routes  bool
    +       midware bool
    +       Engine  EngineIface
     }

    +
    +func (app *App) Setup() {
    +       app.midware = app.SetMiddleWare()
    +       app.routes = app.SetRoutes()
    +}
    +
    +func (app *App) Ok() bool {
    +       return app.midware && app.routes
    +}

    -import mw "github.com/labstack/echo/middleware"
    -
    -func (app *App) Setup() (ok bool) {
    -       // Middleware
    -       app.Engine.Use(mw.Logger())
    -       app.Engine.Use(mw.Recover())
    -
    -       // Routes
    +func (app *App) SetRoutes() bool {
            app.Engine.Get("/boards/:id", Getter)
            app.Engine.Get("/boards", ListGetter)
            app.Engine.Put("/boards/:id", Updater)
            app.Engine.Post("/boards", Creator)
            app.Engine.Delete("/boards/:id", Destroyer)
    -       app.Ok, ok = true, true
    -       return
    +       return true
     }

    +++ b/reeky/routes_test.go
    @@ -17,7 +17,7 @@ var _ = Describe("App", func() {
            BeforeEach(func() {
                    engine = echo.New()
                    app = &App{Engine: engine}
    -               app.Setup()
    +               app.SetRoutes()
            })

Теперь протестируем какое middleware у нас подключено:

    // reeky/middleware_test.go
    package reeky_test

    import (
      . "github.com/konjoot/reeky/reeky"
      mw "github.com/labstack/echo/middleware"

      . "github.com/konjoot/reeky/matchers"
      . "github.com/konjoot/reeky/mocks"
      . "github.com/onsi/ginkgo"
      . "github.com/onsi/gomega"
    )

    var _ = Describe("App", func() {
      var (
        app    *App
        engine *EngineMock
      )

      BeforeEach(func() {
        engine = &EngineMock{}
        app = &App{Engine: engine}
        app.SetMiddleWare()
      })

      It("should use expected middleware", func() {
        Expect(engine).To(UseMiddleWare(mw.Logger()))
        Expect(engine).To(UseMiddleWare(mw.Recover()))
      })
    })


    // matchers/use_middleware.go
    package matchers

    import (
      "github.com/labstack/echo"
      "reflect"
      "runtime"

      . "github.com/konjoot/reeky/mocks"
      "github.com/onsi/gomega/format"
      "github.com/onsi/gomega/matchers"
    )

    func UseMiddleWare(midware echo.MiddlewareFunc) *useMiddleWareMatcher {
      name := runtime.FuncForPC(reflect.ValueOf(midware).Pointer()).Name()
      return &useMiddleWareMatcher{midware: name}
    }

    type useMiddleWareMatcher struct {
      midware string
    }

    func (m *useMiddleWareMatcher) Match(actual interface{}) (success bool, err error) {
      return (&matchers.ContainElementMatcher{Element: m.midware}).Match(actual.(*EngineMock).MiddleWares())
    }

    func (m *useMiddleWareMatcher) FailureMessage(actual interface{}) (message string) {
      return format.Message(actual.(*EngineMock).MiddleWares(), "to have middleware", m.midware)
    }

    func (m *useMiddleWareMatcher) NegatedFailureMessage(actual interface{}) (message string) {
      return format.Message(actual.(*EngineMock).MiddleWares(), "not to have middleware", m.midware)
    }


    // mocks/engine.go
    package mocks

    import (
      "github.com/labstack/echo"
      "reflect"
      "runtime"
    )

    type EngineMock struct {
      port     string
      running  bool
      midwares []string
    }
    ...
    func (e *EngineMock) Use(m ...echo.Middleware) {
      for _, h := range m {
        name := runtime.FuncForPC(reflect.ValueOf(h).Pointer()).Name()
        e.midwares = append(e.midwares, name)
      }
    }

    func (e *EngineMock) MiddleWares() []string {
      return e.midwares
    }

Теперь нужно отрефакторить матчеры, их у нас уже четыре и в них дублируется один и тот же код, реализующий интерфейс gomega-матчера, в общем виде это можно представить так:

    type baseMatcher struct{ ifaces.MatcherIface }

    func (m *baseMatcher) Match(actual interface{}) (success bool, err error) {
      return m.Matcher().Match(m.Prepare(actual))
    }

    func (m *baseMatcher) FailureMessage(actual interface{}) string {
      return fmt.Sprintf(m.Template(false), m.Format(actual), m.Message())
    }

    func (m *baseMatcher) NegatedFailureMessage(actual interface{}) string {
      return fmt.Sprintf(m.Template(true), m.Format(actual), m.Message())
    }

    func (m *baseMatcher) Template(negate bool) (s string) {
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

Следовательно в каждом из наших кастомных матчеров достаточно будет реализовать интерфейс требуемый BaseMatcher-у для приведения их к gomega-матчеру:

    type MatcherIface interface {
      Matcher() types.GomegaMatcher
      Prepare(actual interface{}) interface{}
      Format(actual interface{}) string
      Message() string
      String() string
    }

Для этого реализуем следующий конструктор:

    func Matcher(m MatcherIface) *baseMatcher {
      return &baseMatcher{m}
    }

После этого наши матчеры можно переписать так:

    // matchers/be_ok.go
    package matchers

    import (
      . "github.com/konjoot/reeky/reeky"

      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeOk() *baseMatcher {
      return Matcher(&beOkMatcher{})
    }

    type beOkMatcher struct{}

    func (m *beOkMatcher) Matcher() types.GomegaMatcher {
      return &matchers.BeTrueMatcher{}
    }

    func (m *beOkMatcher) Prepare(actual interface{}) interface{} {
      return actual.(*App).Ok()
    }

    func (m *beOkMatcher) Format(actual interface{}) string {
      return actual.(*App).String()
    }

    func (_ *beOkMatcher) Message() string {
      return "to be Ok"
    }

    func (_ *beOkMatcher) String() (s string) {
      return
    }


    // matchers/be_running.go
    package matchers

    import (
      . "github.com/konjoot/reeky/mocks"
      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func BeRunning() *baseMatcher {
      return Matcher(&beRunningMatcher{})
    }

    type beRunningMatcher struct{}

    func (m *beRunningMatcher) Matcher() types.GomegaMatcher {
      return &matchers.BeTrueMatcher{}
    }

    func (m *beRunningMatcher) Prepare(actual interface{}) interface{} {
      return actual.(*EngineMock).IsRunning()
    }

    func (m *beRunningMatcher) Format(actual interface{}) string {
      return actual.(*EngineMock).String()
    }

    func (_ *beRunningMatcher) Message() string {
      return "to be running"
    }

    func (_ *beRunningMatcher) String() (s string) {
      return
    }


    // matchers/handle.go
    package matchers

    import (
      "fmt"
      "github.com/labstack/echo"
      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
      "strings"
    )

    func Handle(method string) *handleMatcher {
      return &handleMatcher{expected: echo.Route{Method: method}}
    }

    type handleMatcher struct {
      expected echo.Route
    }

    func (m *handleMatcher) On(path string) *handleMatcher {
      m.expected.Path = path
      return m
    }

    func (m *handleMatcher) By(handler string) *baseMatcher {
      m.expected.Handler = "github.com/konjoot/reeky/reeky." + handler
      return Matcher(m)
    }

    func (m *handleMatcher) Matcher() types.GomegaMatcher {
      return &matchers.ContainElementMatcher{Element: m.expected}
    }

    func (m *handleMatcher) Prepare(actual interface{}) interface{} {
      return actual.(*echo.Echo).Routes()
    }

    func (_ *handleMatcher) Format(actual interface{}) string {
      s := make([]string, 1)

      for _, route := range actual.(*echo.Echo).Routes() {
        s = append(s, fmt.Sprintf("%//v", route))
      }

      return "[  " + strings.Join(s, "\n\t   ") + "  ]"
    }

    func (_ *handleMatcher) Message() string {
      return "to have route"
    }

    func (m *handleMatcher) String() (s string) {
      return fmt.Sprintf("%//v", m.expected)
    }


    // matchers/use_middleware.go
    package matchers

    import (
      "fmt"
      "github.com/labstack/echo"
      "reflect"
      "runtime"
      "strings"

      . "github.com/konjoot/reeky/mocks"
      "github.com/onsi/gomega/matchers"
      "github.com/onsi/gomega/types"
    )

    func UseMiddleWare(midware echo.MiddlewareFunc) *baseMatcher {
      name := runtime.FuncForPC(reflect.ValueOf(midware).Pointer()).Name()
      return Matcher(&useMiddleWareMatcher{midware: name})
    }

    type useMiddleWareMatcher struct {
      midware string
    }

    func (m *useMiddleWareMatcher) Matcher() types.GomegaMatcher {
      return &matchers.ContainElementMatcher{Element: m.midware}
    }

    func (_ *useMiddleWareMatcher) Prepare(actual interface{}) interface{} {
      return actual.(*EngineMock).MiddleWares()
    }

    func (_ *useMiddleWareMatcher) Format(actual interface{}) string {
      return "[  " + strings.Join(actual.(*EngineMock).MiddleWares(), "\n\t   ") + "  ]"
    }

    func (_ *useMiddleWareMatcher) Message() string {
      return "to have middleware"
    }

    func (m *useMiddleWareMatcher) String() (s string) {
      return fmt.Sprintf("%//v", m.midware)
    }


Что это нам дает? Во-первых, унификация, модифицируя baseMatcher мы можем изменять поведение всех наших кастомных матчеров. Во-вторых, матчеры приобрели описательный вид, т.е. теперь мы не паримся по поводу реализации gomega-совместимого матчера, а просто описываем, какой стандартный матчер используется, опорную строку для сообщений об ошибках, как отображать actual и expected части матчера в сообщениях. В-третьих, меньше дублирования кода, для каждого матчера мы описываем только его уникальные части, все остальное делает за нас baseMatcher.