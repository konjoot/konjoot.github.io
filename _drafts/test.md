---
layout: post
title:  "Highlight test."
categories: posts
---


Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного
Итак мы имеем кучу всего интересного

<pre class="language-go line-numbers"><code>
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