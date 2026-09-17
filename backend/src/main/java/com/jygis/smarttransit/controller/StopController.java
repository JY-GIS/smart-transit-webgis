package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.StopService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stops")
@RequiredArgsConstructor
public class StopController {

    private final StopService stopService;

    @GetMapping
    public Result findAll() {
        return Result.success(stopService.findAll());
    }
}