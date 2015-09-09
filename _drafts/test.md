---
layout: post
title:  "Highlight test."
categories: posts
---


Итак мы имеем кучу всего интересного. При этом безусловно мы учитываем различныем моменты, которые раньше не учитывали, и как видно из кода ниже лучше делать все по манам, хотя немного эвристического мышления не помешает.

<pre class="language-go line-numbers toggable twisted" placeholder="handlers/create.go"><code>
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

</code></pre>


<pre class="language-go line-numbers toggable twisted" placeholder="something else"><code>
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

</code></pre>
