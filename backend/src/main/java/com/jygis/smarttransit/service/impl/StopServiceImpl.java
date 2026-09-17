package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.StopMapper;
import com.jygis.smarttransit.pojo.Stop;
import com.jygis.smarttransit.service.StopService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StopServiceImpl implements StopService {

    private final StopMapper stopMapper;

    @Override
    public List<Stop> findAll() {
        return stopMapper.findAll();
    }
}